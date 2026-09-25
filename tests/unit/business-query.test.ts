import { describe, expect, it } from "vitest"

import { buildBusinessQuery } from "@/repositories/business.repository"
import { businessFiltersSchema } from "@/schemas/business"

/** Filters always flow through the schema, exactly as the API does. */
function parse(input: Record<string, unknown>) {
  return businessFiltersSchema.parse(input)
}

describe("buildBusinessQuery", () => {
  it("applies only the default closed-business exclusion when nothing is set", () => {
    const query = buildBusinessQuery(parse({}))
    expect(query.$and).toHaveLength(1)
  })

  it("matches businesses without a website, including missing and empty", () => {
    const query = buildBusinessQuery(parse({ website: "no" }))

    expect(query.$and).toContainEqual({
      $or: [
        { website: { $exists: false } },
        { website: null },
        { website: "" },
      ],
    })
  })

  it("matches businesses that do have a website", () => {
    const query = buildBusinessQuery(parse({ website: "yes" }))

    expect(query.$and).toContainEqual({
      website: { $exists: true, $nin: [null, ""] },
    })
  })

  it("targets the nested path for the Instagram filter", () => {
    const query = buildBusinessQuery(parse({ instagram: "yes" }))

    expect(query.$and).toContainEqual({
      "enrichment.socials.instagram": { $exists: true, $nin: [null, ""] },
    })
  })

  it("combines multiple filters with $and", () => {
    const query = buildBusinessQuery(
      parse({
        website: "no",
        phone: "yes",
        city: "São Paulo",
        minRating: "4.5",
        minReviews: "100",
      })
    )

    // Five explicit filters plus the default closed-business exclusion.
    expect(query.$and).toHaveLength(6)
    expect(query.$and).toContainEqual({ "address.city": "São Paulo" })
    expect(query.$and).toContainEqual({ rating: { $gte: 4.5 } })
    expect(query.$and).toContainEqual({ reviewsCount: { $gte: 100 } })
  })

  it("escapes regex metacharacters in the free-text search", () => {
    const query = buildBusinessQuery(parse({ search: "Silva (Centro)" }))
    const clause = query.$and?.find((item) => "$or" in item) as {
      $or: { name: RegExp }[]
    }

    expect(clause.$or[0].name.source).toContain("\\(Centro\\)")
    expect(() => new RegExp(clause.$or[0].name.source)).not.toThrow()
  })

  it("covers the whole final day of a collection date range", () => {
    const query = buildBusinessQuery(
      parse({ collectedFrom: "2026-01-01", collectedTo: "2026-01-31" })
    )
    const clause = query.$and?.find((item) => "collectedAt" in item) as {
      collectedAt: { $lte: Date }
    }

    expect(clause.collectedAt.$lte.getHours()).toBe(23)
    expect(clause.collectedAt.$lte.getMinutes()).toBe(59)
  })
})

describe("businessFiltersSchema", () => {
  it("applies defaults for pagination and presence filters", () => {
    const filters = parse({})

    expect(filters.page).toBe(1)
    expect(filters.pageSize).toBe(25)
    expect(filters.website).toBe("any")
    expect(filters.sortBy).toBe("collectedAt")
    expect(filters.sortDir).toBe("desc")
  })

  it("coerces numeric query-string values", () => {
    const filters = parse({ page: "3", pageSize: "50", minRating: "4" })

    expect(filters.page).toBe(3)
    expect(filters.pageSize).toBe(50)
    expect(filters.minRating).toBe(4)
  })

  it("rejects a page size above the allowed maximum", () => {
    expect(() => parse({ pageSize: "5000" })).toThrow()
  })

  it("treats empty strings as absent filters", () => {
    const filters = parse({ search: "", category: "" })

    expect(filters.search).toBeUndefined()
    expect(filters.category).toBeUndefined()
  })
})

describe("filtro de empresas encerradas", () => {
  const closedClause = {
    operationalStatus: {
      $nin: ["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"],
    },
  }

  it("exclui encerradas por padrão, sem precisar do parâmetro", () => {
    // A closed business is never a usable lead, so it is hidden by default.
    expect(buildBusinessQuery(parse({})).$and).toContainEqual(closedClause)
  })

  it("mantém o filtro quando explicitamente ligado", () => {
    expect(
      buildBusinessQuery(parse({ hideClosed: "true" })).$and
    ).toContainEqual(closedClause)
  })

  it("mostra as encerradas quando o usuário opta por vê-las", () => {
    expect(buildBusinessQuery(parse({ hideClosed: "false" }))).toEqual({})
  })
})
