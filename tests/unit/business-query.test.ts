import { describe, expect, it } from "vitest"

import { WHATSAPP_PHONE_TYPES } from "@/domain/phone"
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

describe("filtro de categorias", () => {
  it("uma categoria vira igualdade simples", () => {
    expect(
      buildBusinessQuery(parse({ category: "Dentista" })).$and
    ).toContainEqual({ category: "Dentista" })
  })

  it("várias categorias separadas por | viram $in", () => {
    const filters = parse({ category: "Dentista| Clínica odontológica |" })
    expect(filters.category).toEqual(["Dentista", "Clínica odontológica"])
    expect(buildBusinessQuery(filters).$and).toContainEqual({
      category: { $in: ["Dentista", "Clínica odontológica"] },
    })
  })
})

describe("filtro de WhatsApp", () => {
  const signs = [
    { phoneType: { $in: WHATSAPP_PHONE_TYPES } },
    { "enrichment.socials.whatsapp": { $exists: true, $nin: [null, ""] } },
  ]

  it("com: celular (de qualquer país) ou link de WhatsApp no site", () => {
    expect(buildBusinessQuery(parse({ whatsapp: "yes" })).$and).toContainEqual({
      $or: signs,
    })
  })

  it("sem: nenhum dos dois", () => {
    expect(buildBusinessQuery(parse({ whatsapp: "no" })).$and).toContainEqual({
      $nor: signs,
    })
  })
})

describe("filtro de data da coleta", () => {
  it("usa os dias do calendário de Brasília, incluindo o último dia inteiro", () => {
    const query = buildBusinessQuery(
      parse({ collectedFrom: "2026-10-01", collectedTo: "2026-10-02" })
    )
    expect(query.$and).toContainEqual({
      collectedAt: {
        $gte: new Date("2026-10-01T03:00:00.000Z"),
        $lte: new Date("2026-10-03T02:59:59.999Z"),
      },
    })
  })

  it("aplica as horas no primeiro e no último dia, incluindo o minuto final", () => {
    const query = buildBusinessQuery(
      parse({
        collectedFrom: "2026-10-01",
        collectedTo: "2026-10-02",
        collectedFromTime: "08:30",
        collectedToTime: "18:00",
      })
    )
    expect(query.$and).toContainEqual({
      collectedAt: {
        $gte: new Date("2026-10-01T11:30:00.000Z"),
        $lte: new Date("2026-10-02T21:00:59.999Z"),
      },
    })
  })

  it("ignora horas sem data ou em formato inválido", () => {
    const withoutDate = buildBusinessQuery(
      parse({ collectedFromTime: "08:00" })
    )
    expect(JSON.stringify(withoutDate)).not.toContain("collectedAt")

    const invalidTime = buildBusinessQuery(
      parse({ collectedFrom: "2026-10-01", collectedFromTime: "25:00" })
    )
    expect(invalidTime.$and).toContainEqual({
      collectedAt: { $gte: new Date("2026-10-01T03:00:00.000Z") },
    })
  })

  it("ignora datas em formato inválido", () => {
    const query = buildBusinessQuery(parse({ collectedFrom: "ontem" }))
    expect(JSON.stringify(query)).not.toContain("collectedAt")
  })
})

describe("filtro de país", () => {
  it("usa o país do endereço, depois o do telefone, e Brasil sem nenhum", () => {
    const filters = parse({ country: "br|pt" })
    expect(filters.country).toEqual(["BR", "PT"])

    const noAddressCountry = { "address.country": { $in: [null, ""] } }
    expect(buildBusinessQuery(filters).$and).toContainEqual({
      $or: [
        { "address.country": { $in: ["BR", "PT"] } },
        { ...noAddressCountry, phoneCountry: { $in: ["BR", "PT"] } },
        { ...noAddressCountry, phoneCountry: { $in: [null, ""] } },
      ],
    })
  })

  it("sem Brasil, leads sem país ficam de fora", () => {
    const query = buildBusinessQuery(parse({ country: "PT" }))
    const clause = query.$and?.find((item) => "$or" in item) as {
      $or: unknown[]
    }
    expect(clause.$or).toHaveLength(2)
  })
})
