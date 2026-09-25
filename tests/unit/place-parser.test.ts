import { describe, expect, it } from "vitest"

import {
  buildFormattedAddress,
  normalizeInstagram,
  normalizePhone,
  normalizePlace,
  normalizeWebsite,
} from "@crawler/parsers/place.parser"

describe("normalizePhone", () => {
  it("keeps only digits and preserves the international prefix", () => {
    expect(normalizePhone("+55 (11) 98888-7777")).toBe("+5511988887777")
    expect(normalizePhone("(11) 3333-4444")).toBe("1133334444")
  })

  it("discards values that are too short to be a phone number", () => {
    expect(normalizePhone("123")).toBeUndefined()
    expect(normalizePhone("")).toBeUndefined()
    expect(normalizePhone(undefined)).toBeUndefined()
  })
})

describe("normalizeWebsite", () => {
  it("adds a scheme when it is missing", () => {
    expect(normalizeWebsite("exemplo.com.br")).toBe("https://exemplo.com.br")
  })

  it("strips the trailing slash", () => {
    expect(normalizeWebsite("https://exemplo.com.br/")).toBe(
      "https://exemplo.com.br"
    )
  })

  it("rejects values without a valid hostname", () => {
    expect(normalizeWebsite("localhost")).toBeUndefined()
    expect(normalizeWebsite("   ")).toBeUndefined()
  })
})

describe("normalizeInstagram", () => {
  it("extracts the handle from a profile URL", () => {
    expect(normalizeInstagram("https://www.instagram.com/empresa.teste/")).toBe(
      "empresa.teste"
    )
  })

  it("accepts a bare @handle", () => {
    expect(normalizeInstagram("@Empresa")).toBe("empresa")
  })

  it("ignores non-profile Instagram paths", () => {
    expect(normalizeInstagram("https://instagram.com/p/")).toBeUndefined()
  })
})

describe("buildFormattedAddress", () => {
  it("joins the available parts", () => {
    expect(
      buildFormattedAddress({
        street: "Rua A",
        number: "10",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
      })
    ).toBe("Rua A, 10 • Centro • São Paulo - SP")
  })

  it("returns undefined when there is nothing to format", () => {
    expect(buildFormattedAddress({})).toBeUndefined()
  })
})

describe("normalizePlace", () => {
  it("clamps the rating and defaults the review count", () => {
    const place = normalizePlace({
      externalId: "1",
      source: "mock",
      name: "  Teste  ",
      rating: 7.89,
      address: {},
      location: {},
    })

    expect(place.name).toBe("Teste")
    expect(place.rating).toBe(5)
    expect(place.reviewsCount).toBe(0)
  })

  it("preserves places without a website (requirement 13)", () => {
    const place = normalizePlace({
      externalId: "2",
      source: "mock",
      name: "Sem site",
      address: { city: "São Paulo" },
      location: {},
    })

    expect(place.website).toBeUndefined()
    expect(place.name).toBe("Sem site")
  })
})

describe("OsmPlaceSource sem coordenadas", () => {
  it("exige coordenadas e explica a alternativa", async () => {
    const { OsmPlaceSource } = await import("@crawler/sources/osm.source")
    const source = new OsmPlaceSource("https://example.com", "test", 5000)

    await expect(
      source.search({
        category: "Restaurante",
        location: "Santana, São Paulo, SP",
        radiusMeters: 3000,
        limit: 10,
      })
    ).rejects.toThrow(/exige latitude e longitude/)
  })
})

describe("isClosed", () => {
  it("identifica empresas que não valem prospecção", async () => {
    const { isClosed } = await import("@/domain/business")

    expect(isClosed({ operationalStatus: "CLOSED_PERMANENTLY" })).toBe(true)
    expect(isClosed({ operationalStatus: "CLOSED_TEMPORARILY" })).toBe(true)
    expect(isClosed({ operationalStatus: "OPERATIONAL" })).toBe(false)
    expect(isClosed({})).toBe(false)
  })
})
