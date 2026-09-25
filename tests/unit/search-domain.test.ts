import { describe, expect, it } from "vitest"

import { computeProgress, isTerminal } from "@/domain/search"
import { searchFormSchema } from "@/schemas/search"

describe("computeProgress", () => {
  it("returns an integer percentage of the limit", () => {
    expect(computeProgress(50, 100)).toBe(50)
    expect(computeProgress(33, 100)).toBe(33)
  })

  it("caps the value at 100 when more results arrive than requested", () => {
    expect(computeProgress(150, 100)).toBe(100)
  })

  it("returns 0 for a non-positive limit", () => {
    expect(computeProgress(10, 0)).toBe(0)
  })
})

describe("isTerminal", () => {
  it("identifies finished statuses", () => {
    expect(isTerminal("COMPLETED")).toBe(true)
    expect(isTerminal("FAILED")).toBe(true)
    expect(isTerminal("CANCELLED")).toBe(true)
  })

  it("identifies in-flight statuses", () => {
    expect(isTerminal("PENDING")).toBe(false)
    expect(isTerminal("RUNNING")).toBe(false)
  })
})

describe("searchFormSchema", () => {
  const valid = {
    category: "Restaurante",
    location: "São Paulo, SP",
    latitude: -23.5505,
    longitude: -46.6333,
    radiusMeters: 3000,
    limit: 50,
  }

  it("accepts a valid payload", () => {
    expect(() => searchFormSchema.parse(valid)).not.toThrow()
  })

  it("coerces numeric strings coming from form inputs", () => {
    const parsed = searchFormSchema.parse({
      ...valid,
      latitude: "-23.5505",
      limit: "25",
    })

    expect(parsed.latitude).toBeCloseTo(-23.5505)
    expect(parsed.limit).toBe(25)
  })

  it("rejects coordinates outside the valid range", () => {
    expect(() => searchFormSchema.parse({ ...valid, latitude: 120 })).toThrow()
    expect(() =>
      searchFormSchema.parse({ ...valid, longitude: -200 })
    ).toThrow()
  })

  it("accepts a search with no coordinates at all", () => {
    const parsed = searchFormSchema.parse({
      ...valid,
      latitude: "",
      longitude: "",
    })

    expect(parsed.latitude).toBeUndefined()
    expect(parsed.longitude).toBeUndefined()
  })

  it("omits coordinates entirely when the keys are absent", () => {
    const parsed = searchFormSchema.parse({
      category: valid.category,
      location: valid.location,
      radiusMeters: valid.radiusMeters,
      limit: valid.limit,
    })

    expect(parsed.latitude).toBeUndefined()
    expect(parsed.location).toBe("São Paulo, SP")
  })

  it("requires latitude and longitude as a pair", () => {
    expect(() => searchFormSchema.parse({ ...valid, longitude: "" })).toThrow(
      /juntas/
    )
    expect(() => searchFormSchema.parse({ ...valid, latitude: "" })).toThrow(
      /juntas/
    )
  })

  it("enforces the radius and limit boundaries", () => {
    expect(() =>
      searchFormSchema.parse({ ...valid, radiusMeters: 50 })
    ).toThrow()
    expect(() => searchFormSchema.parse({ ...valid, limit: 900 })).toThrow()
  })
})
