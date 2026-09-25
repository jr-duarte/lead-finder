import { describe, expect, it } from "vitest"

import { MockPlaceSource } from "@crawler/sources/mock.source"

const INPUT = {
  category: "Restaurante",
  location: "São Paulo, SP",
  latitude: -23.5505,
  longitude: -46.6333,
  radiusMeters: 3000,
  limit: 40,
}

describe("MockPlaceSource", () => {
  const source = new MockPlaceSource()

  it("returns exactly the requested number of places", async () => {
    const places = await source.search(INPUT)
    expect(places).toHaveLength(40)
  })

  it("is deterministic for the same input", async () => {
    const first = await source.search(INPUT)
    const second = await source.search(INPUT)

    expect(first.map((place) => place.externalId)).toEqual(
      second.map((place) => place.externalId)
    )
    expect(first[0].name).toBe(second[0].name)
  })

  it("produces unique external ids", async () => {
    const places = await source.search(INPUT)
    const ids = new Set(places.map((place) => place.externalId))

    expect(ids.size).toBe(places.length)
  })

  it("includes places both with and without a website", async () => {
    const places = await source.search(INPUT)

    expect(places.some((place) => place.website)).toBe(true)
    expect(places.some((place) => !place.website)).toBe(true)
  })

  it("keeps coordinates within the requested radius", async () => {
    const places = await source.search(INPUT)
    const delta = INPUT.radiusMeters / 111_000

    for (const place of places) {
      expect(
        Math.abs(place.location.latitude! - INPUT.latitude)
      ).toBeLessThanOrEqual(delta)
      expect(
        Math.abs(place.location.longitude! - INPUT.longitude)
      ).toBeLessThanOrEqual(delta)
    }
  })

  it("fills the city from the requested location", async () => {
    const places = await source.search(INPUT)
    expect(places[0].address.city).toBe("São Paulo")
    expect(places[0].address.state).toBe("SP")
  })
})

describe("MockPlaceSource sem coordenadas", () => {
  it("usa um centro padrão quando as coordenadas são omitidas", async () => {
    const places = await new MockPlaceSource().search({
      category: "Restaurante",
      location: "Santana, São Paulo, SP",
      radiusMeters: 3000,
      limit: 5,
    })

    expect(places).toHaveLength(5)
    expect(places[0].location.latitude).toBeDefined()
  })
})
