import { normalizePlace } from "@crawler/parsers/place.parser"
import type {
  PlaceSearchInput,
  PlaceSource,
  RawPlace,
} from "@crawler/sources/types"

/**
 * Google Places API (New) — Text Search.
 *
 * Unlike OSM, Google provides rating and review counts, which the rating
 * filters depend on. Requires a billed API key.
 *
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 */

/**
 * Only the fields the system actually stores are requested: the API bills per
 * field mask tier, so asking for less costs less.
 */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.primaryTypeDisplayName",
  "places.types",
  // All three sit in the tier already being paid for.
  "places.businessStatus",
  "places.primaryType",
  "places.googleMapsUri",
].join(",")

/** One page is 20 results; the API caps pagination at 60. */
const PAGE_SIZE = 20
const MAX_RESULTS = 60

type AddressComponent = {
  longText?: string
  shortText?: string
  types?: string[]
}

type GooglePlace = {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  addressComponents?: AddressComponent[]
  location?: { latitude?: number; longitude?: number }
  rating?: number
  userRatingCount?: number
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  primaryTypeDisplayName?: { text?: string }
  types?: string[]
  businessStatus?: string
  primaryType?: string
  googleMapsUri?: string
}

type SearchResponse = {
  places?: GooglePlace[]
  nextPageToken?: string
  error?: { message?: string; status?: string }
}

/** Reads one address component by its Google type. */
function component(
  components: AddressComponent[] | undefined,
  type: string,
  form: "long" | "short" = "long"
): string | undefined {
  const match = components?.find((item) => item.types?.includes(type))
  return form === "short" ? match?.shortText : match?.longText
}

export class GooglePlaceSource implements PlaceSource {
  readonly name = "google"

  constructor(
    private readonly apiKey: string,
    private readonly endpoint: string,
    private readonly timeoutMs: number,
    private readonly language = "pt-BR",
    private readonly region = "BR"
  ) {}

  async search(input: PlaceSearchInput): Promise<RawPlace[]> {
    if (!this.apiKey) {
      throw new Error(
        "GOOGLE_MAPS_API_KEY não configurada. Defina a chave no .env.local para usar a fonte 'google'."
      )
    }

    const wanted = Math.min(input.limit, MAX_RESULTS)
    const collected: GooglePlace[] = []
    let pageToken: string | undefined

    // Paginate until the requested amount is reached or results run out.
    while (collected.length < wanted) {
      const page = await this.fetchPage(input, wanted, pageToken)
      collected.push(...(page.places ?? []))

      if (!page.nextPageToken || (page.places ?? []).length === 0) break
      pageToken = page.nextPageToken
    }

    return collected
      .slice(0, input.limit)
      .map((place) => this.toPlace(place, input))
      .filter((place): place is RawPlace => place !== null)
      .map(normalizePlace)
  }

  private async fetchPage(
    input: PlaceSearchInput,
    wanted: number,
    pageToken?: string
  ): Promise<SearchResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const body: Record<string, unknown> = {
        textQuery: `${input.category} em ${input.location}`,
        languageCode: this.language,
        regionCode: this.region,
        pageSize: Math.min(PAGE_SIZE, wanted),
      }

      // The text query already carries the location, so the geographic bias is
      // only added when explicit coordinates narrow the area further. Sending a
      // stale default here would fight the query (e.g. "Santana" biased to the
      // city centre).
      if (input.latitude !== undefined && input.longitude !== undefined) {
        body.locationBias = {
          circle: {
            center: {
              latitude: input.latitude,
              longitude: input.longitude,
            },
            radius: Math.min(input.radiusMeters, 50_000),
          },
        }
      }

      if (pageToken) body.pageToken = pageToken

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": `${FIELD_MASK},nextPageToken`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      const payload = (await response.json()) as SearchResponse

      if (!response.ok) {
        throw new Error(this.describeError(response.status, payload))
      }

      return payload
    } finally {
      clearTimeout(timer)
    }
  }

  /** Turns Google's error codes into messages that point at the fix. */
  private describeError(status: number, payload: SearchResponse): string {
    const detail = payload.error?.message ?? ""

    if (status === 400 && /API key not valid/i.test(detail)) {
      return "Chave da Google Places API inválida. Verifique GOOGLE_MAPS_API_KEY no .env.local."
    }
    if (status === 403) {
      return "Acesso negado pelo Google. Confirme que a 'Places API (New)' está ativada e que o faturamento está habilitado no projeto."
    }
    if (status === 429) {
      return "Limite de requisições do Google atingido. Aguarde alguns instantes e tente novamente."
    }

    return `Google Places respondeu com status ${status}. ${detail}`.trim()
  }

  private toPlace(
    place: GooglePlace,
    input: PlaceSearchInput
  ): RawPlace | null {
    const name = place.displayName?.text?.trim()
    if (!name) return null

    const components = place.addressComponents

    return {
      externalId: place.id,
      source: this.name,
      name,
      category: place.primaryTypeDisplayName?.text ?? input.category,
      phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber,
      website: place.websiteUri,
      rating: place.rating,
      reviewsCount: place.userRatingCount ?? 0,
      businessStatus: place.businessStatus,
      primaryType: place.primaryType,
      mapsUrl: place.googleMapsUri,
      address: {
        street: component(components, "route"),
        number: component(components, "street_number"),
        neighborhood:
          component(components, "sublocality_level_1") ??
          component(components, "sublocality"),
        city:
          component(components, "administrative_area_level_2") ??
          component(components, "locality"),
        state: component(components, "administrative_area_level_1", "short"),
        postalCode: component(components, "postal_code"),
        country: component(components, "country", "short") ?? "BR",
        formatted: place.formattedAddress,
      },
      location: {
        latitude: place.location?.latitude,
        longitude: place.location?.longitude,
      },
    }
  }
}
