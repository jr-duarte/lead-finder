import { describe, expect, it, vi } from "vitest"

import { GooglePlaceSource } from "@crawler/sources/google.source"

const INPUT = {
  category: "Restaurante",
  location: "São Paulo, SP",
  latitude: -23.5613,
  longitude: -46.6565,
  radiusMeters: 800,
  limit: 20,
}

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const SAMPLE_PLACE = {
  id: "ChIJ_abc123",
  displayName: { text: "Restaurante Jiquitaia" },
  formattedAddress: "R. Antônio Carlos, 268 - Consolação, São Paulo - SP",
  addressComponents: [
    { longText: "268", types: ["street_number"] },
    { longText: "Rua Antônio Carlos", types: ["route"] },
    { longText: "Consolação", types: ["sublocality_level_1"] },
    { longText: "São Paulo", types: ["administrative_area_level_2"] },
    {
      longText: "São Paulo",
      shortText: "SP",
      types: ["administrative_area_level_1"],
    },
    { longText: "01309-010", types: ["postal_code"] },
    { longText: "Brasil", shortText: "BR", types: ["country"] },
  ],
  location: { latitude: -23.5541, longitude: -46.6531 },
  rating: 4.6,
  userRatingCount: 1284,
  internationalPhoneNumber: "+55 11 3262-2366",
  websiteUri: "https://jiquitaia.com.br/",
  primaryTypeDisplayName: { text: "Restaurante" },
  businessStatus: "OPERATIONAL",
  primaryType: "italian_restaurant",
  googleMapsUri: "https://maps.google.com/?cid=123",
}

describe("GooglePlaceSource", () => {
  it("maps the API payload onto the domain shape", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ places: [SAMPLE_PLACE] })
    )
    vi.stubGlobal("fetch", fetchImpl)

    const source = new GooglePlaceSource("key-123", ENDPOINT, 5000)
    const places = await source.search(INPUT)

    expect(places).toHaveLength(1)
    const place = places[0]

    expect(place.externalId).toBe("ChIJ_abc123")
    expect(place.source).toBe("google")
    expect(place.name).toBe("Restaurante Jiquitaia")
    // Rating and reviews are the reason for using Google over OSM.
    expect(place.rating).toBe(4.6)
    expect(place.reviewsCount).toBe(1284)
    expect(place.phone).toBe("+551132622366")
    expect(place.website).toBe("https://jiquitaia.com.br")
    expect(place.address.city).toBe("São Paulo")
    expect(place.address.state).toBe("SP")
    expect(place.address.postalCode).toBe("01309-010")
    expect(place.businessStatus).toBe("OPERATIONAL")
    expect(place.primaryType).toBe("italian_restaurant")
    expect(place.mapsUrl).toBe("https://maps.google.com/?cid=123")

    vi.unstubAllGlobals()
  })

  it("sends the key and field mask as headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ places: [] })
    )
    vi.stubGlobal("fetch", fetchImpl)

    await new GooglePlaceSource("key-abc", ENDPOINT, 5000).search(INPUT)

    const [, init] = fetchImpl.mock.calls[0]
    const headers = init?.headers as Record<string, string>

    expect(headers["X-Goog-Api-Key"]).toBe("key-abc")
    expect(headers["X-Goog-FieldMask"]).toContain("places.rating")
    expect(headers["X-Goog-FieldMask"]).toContain("places.userRatingCount")
    expect(headers["X-Goog-FieldMask"]).toContain("places.businessStatus")
    expect(headers["X-Goog-FieldMask"]).toContain("places.googleMapsUri")

    vi.unstubAllGlobals()
  })

  it("biases results toward the requested coordinates", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ places: [] })
    )
    vi.stubGlobal("fetch", fetchImpl)

    await new GooglePlaceSource("key", ENDPOINT, 5000).search(INPUT)

    const [, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(String(init?.body))

    expect(body.textQuery).toBe("Restaurante em São Paulo, SP")
    expect(body.locationBias.circle.center.latitude).toBe(INPUT.latitude)
    expect(body.locationBias.circle.radius).toBe(800)
    expect(body.languageCode).toBe("pt-BR")

    vi.unstubAllGlobals()
  })

  it("follows pagination until the requested limit is reached", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          places: Array.from({ length: 20 }, (_, index) => ({
            ...SAMPLE_PLACE,
            id: `first-${index}`,
          })),
          nextPageToken: "token-2",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          places: Array.from({ length: 5 }, (_, index) => ({
            ...SAMPLE_PLACE,
            id: `second-${index}`,
          })),
        })
      )
    vi.stubGlobal("fetch", fetchImpl)

    const places = await new GooglePlaceSource("key", ENDPOINT, 5000).search({
      ...INPUT,
      limit: 25,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(places).toHaveLength(25)

    vi.unstubAllGlobals()
  })

  it("omits the geographic bias when no coordinates are given", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ places: [] })
    )
    vi.stubGlobal("fetch", fetchImpl)

    await new GooglePlaceSource("key", ENDPOINT, 5000).search({
      category: "Restaurante",
      location: "Santana, São Paulo, SP",
      radiusMeters: 3000,
      limit: 20,
    })

    const [, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(String(init?.body))

    // The text query alone must locate the search; a stale default bias would
    // pull results away from the requested neighbourhood.
    expect(body.locationBias).toBeUndefined()
    expect(body.textQuery).toBe("Restaurante em Santana, São Paulo, SP")

    vi.unstubAllGlobals()
  })

  it("ignora o raio quando não há coordenadas", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ places: [] })
    )
    vi.stubGlobal("fetch", fetchImpl)

    await new GooglePlaceSource("key", ENDPOINT, 5000).search({
      category: "Padaria",
      location: "Santana, São Paulo, SP",
      radiusMeters: 500,
      limit: 10,
    })

    const [, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(String(init?.body))

    // Without a centre there is nothing to draw a radius around.
    expect(body.locationBias).toBeUndefined()

    vi.unstubAllGlobals()
  })

  it("não passa de 60 resultados, o teto da API", async () => {
    const page = (prefix: string, count: number, token?: string) =>
      jsonResponse({
        places: Array.from({ length: count }, (_, index) => ({
          ...SAMPLE_PLACE,
          id: `${prefix}-${index}`,
        })),
        ...(token ? { nextPageToken: token } : {}),
      })

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page("p1", 20, "t2"))
      .mockResolvedValueOnce(page("p2", 20, "t3"))
      .mockResolvedValueOnce(page("p3", 20))
    vi.stubGlobal("fetch", fetchImpl)

    // 100 was requested, but Google paginates at 60.
    const places = await new GooglePlaceSource("key", ENDPOINT, 5000).search({
      ...INPUT,
      limit: 100,
    })

    expect(places).toHaveLength(60)
    expect(fetchImpl).toHaveBeenCalledTimes(3)

    vi.unstubAllGlobals()
  })

  it("fails with a clear message when the key is missing", async () => {
    const source = new GooglePlaceSource("", ENDPOINT, 5000)
    await expect(source.search(INPUT)).rejects.toThrow(
      /GOOGLE_MAPS_API_KEY não configurada/
    )
  })

  it("explains an invalid key instead of leaking the raw error", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse({ error: { message: "API key not valid" } }, 400)
    )

    await expect(
      new GooglePlaceSource("bad", ENDPOINT, 5000).search(INPUT)
    ).rejects.toThrow(/Chave da Google Places API inválida/)

    vi.unstubAllGlobals()
  })

  it("explains a disabled API or missing billing", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ error: {} }, 403))

    await expect(
      new GooglePlaceSource("key", ENDPOINT, 5000).search(INPUT)
    ).rejects.toThrow(/Places API \(New\).*ativada|faturamento/)

    vi.unstubAllGlobals()
  })

  it("explains a rate limit", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ error: {} }, 429))

    await expect(
      new GooglePlaceSource("key", ENDPOINT, 5000).search(INPUT)
    ).rejects.toThrow(/Limite de requisições/)

    vi.unstubAllGlobals()
  })
})
