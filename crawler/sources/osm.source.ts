import { normalizePlace } from "@crawler/parsers/place.parser"
import type {
  PlaceSearchInput,
  PlaceSource,
  RawPlace,
} from "@crawler/sources/types"

/**
 * OpenStreetMap source via the public Overpass API. No API key required.
 *
 * OSM has no ratings/review counts, so those stay undefined — which is the
 * honest representation, and the enrichment step fills the rest.
 */

type OverpassTags = Record<string, string | undefined>

type OverpassElement = {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: OverpassTags
}

type OverpassResponse = {
  elements?: OverpassElement[]
}

/** Maps a free-text category to an Overpass tag filter. */
function categoryToFilter(category: string): string {
  const normalized = category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()

  const map: Record<string, string> = {
    restaurante: '["amenity"="restaurant"]',
    restaurant: '["amenity"="restaurant"]',
    bar: '["amenity"="bar"]',
    cafe: '["amenity"="cafe"]',
    cafeteria: '["amenity"="cafe"]',
    padaria: '["shop"="bakery"]',
    hotel: '["tourism"="hotel"]',
    farmacia: '["amenity"="pharmacy"]',
    academia: '["leisure"="fitness_centre"]',
    salao: '["shop"="hairdresser"]',
    barbearia: '["shop"="hairdresser"]',
    dentista: '["amenity"="dentist"]',
    clinica: '["amenity"="clinic"]',
    mercado: '["shop"="supermarket"]',
    supermercado: '["shop"="supermarket"]',
    petshop: '["shop"="pet"]',
    oficina: '["shop"="car_repair"]',
    escola: '["amenity"="school"]',
  }

  if (map[normalized]) return map[normalized]

  // Fall back to a name match so arbitrary categories still return something.
  const escaped = normalized.replace(/["\\]/g, "")
  return `["name"~"${escaped}",i]`
}

export class OsmPlaceSource implements PlaceSource {
  readonly name = "osm"

  constructor(
    private readonly endpoint: string,
    private readonly userAgent: string,
    private readonly timeoutMs: number
  ) {}

  async search(input: PlaceSearchInput): Promise<RawPlace[]> {
    // Overpass can only search around a point, so coordinates are required.
    if (input.latitude === undefined || input.longitude === undefined) {
      throw new Error(
        "A fonte 'osm' exige latitude e longitude. Informe as coordenadas ou use a fonte 'google', que localiza pelo texto."
      )
    }

    const filter = categoryToFilter(input.category)
    const around = `(around:${input.radiusMeters},${input.latitude},${input.longitude})`

    const query = `
      [out:json][timeout:25];
      (
        node${filter}${around};
        way${filter}${around};
      );
      out center ${Math.min(input.limit, 500)};
    `.trim()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": this.userAgent,
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(
          `Overpass respondeu com status ${response.status}. Tente novamente em instantes.`
        )
      }

      const payload = (await response.json()) as OverpassResponse
      const elements = payload.elements ?? []

      return elements
        .slice(0, input.limit)
        .map((element) => this.toPlace(element, input))
        .filter((place): place is RawPlace => place !== null)
        .map(normalizePlace)
    } finally {
      clearTimeout(timer)
    }
  }

  private toPlace(
    element: OverpassElement,
    input: PlaceSearchInput
  ): RawPlace | null {
    const tags = element.tags ?? {}
    const name = tags.name?.trim()
    if (!name) return null

    const latitude = element.lat ?? element.center?.lat
    const longitude = element.lon ?? element.center?.lon

    return {
      externalId: `${element.type}/${element.id}`,
      source: this.name,
      name,
      category:
        tags.amenity ??
        tags.shop ??
        tags.tourism ??
        tags.leisure ??
        input.category,
      phone: tags.phone ?? tags["contact:phone"],
      website: tags.website ?? tags["contact:website"],
      rating: undefined,
      reviewsCount: 0,
      address: {
        street: tags["addr:street"],
        number: tags["addr:housenumber"],
        neighborhood: tags["addr:suburb"],
        city: tags["addr:city"] ?? input.location.split(",")[0]?.trim(),
        state: tags["addr:state"],
        postalCode: tags["addr:postcode"],
        country: tags["addr:country"] ?? "BR",
      },
      location: { latitude, longitude },
    }
  }
}
