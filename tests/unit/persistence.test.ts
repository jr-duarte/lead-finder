import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { startTestDatabase } from "../helpers/db"

import { businessRepository } from "@/repositories/business.repository"
import { businessService } from "@/services/business.service"
import { BusinessModel } from "@/models/business.model"
import { businessFiltersSchema } from "@/schemas/business"
import { persistPlaces } from "@crawler/workers/collect.worker"
import type { RawPlace } from "@crawler/sources/types"

let database: Awaited<ReturnType<typeof startTestDatabase>>

function place(
  overrides: Partial<RawPlace> & { externalId: string }
): RawPlace {
  return {
    source: "mock",
    name: "Empresa",
    category: "Restaurante",
    address: { city: "São Paulo", state: "SP" },
    location: {},
    reviewsCount: 0,
    ...overrides,
  }
}

const filters = (input: Record<string, unknown> = {}) =>
  businessFiltersSchema.parse(input)

beforeAll(async () => {
  database = await startTestDatabase("persistence")
}, 120_000)

afterAll(async () => {
  await database.stop()
})

afterEach(async () => {
  await BusinessModel.deleteMany({})
})

describe("persistPlaces", () => {
  it("stores every place, including those without a website", async () => {
    const result = await persistPlaces(
      [
        place({ externalId: "a", website: "https://a.com.br" }),
        place({ externalId: "b" }),
      ],
      "000000000000000000000001"
    )

    expect(result.created).toBe(2)
    expect(await BusinessModel.countDocuments()).toBe(2)

    const stored = await BusinessModel.findOne({ externalId: "b" }).lean()
    expect(stored?.website).toBeUndefined()
  })

  it("updates instead of duplicating on a repeated collection", async () => {
    const searchId = "000000000000000000000001"

    await persistPlaces([place({ externalId: "a", name: "Antigo" })], searchId)
    const second = await persistPlaces(
      [place({ externalId: "a", name: "Novo" })],
      searchId
    )

    expect(second.created).toBe(0)
    expect(second.updated).toBe(1)
    expect(await BusinessModel.countDocuments()).toBe(1)

    const stored = await BusinessModel.findOne({ externalId: "a" }).lean()
    expect(stored?.name).toBe("Novo")
  })

  it("counts duplicates inside the same payload only once", async () => {
    const result = await persistPlaces(
      [place({ externalId: "dup" }), place({ externalId: "dup" })],
      "000000000000000000000001"
    )

    expect(result.found).toBe(2)
    expect(result.created).toBe(1)
    expect(result.duplicated).toBe(1)
    expect(await BusinessModel.countDocuments()).toBe(1)
  })
})

describe("businessRepository filters", () => {
  it("filters by absence of a website at query time (requirement 14)", async () => {
    await persistPlaces(
      [
        place({ externalId: "with", website: "https://x.com.br" }),
        place({ externalId: "without-1" }),
        place({ externalId: "without-2" }),
      ],
      "000000000000000000000001"
    )

    const withoutSite = await businessRepository.list(
      filters({ website: "no" })
    )
    const withSite = await businessRepository.list(filters({ website: "yes" }))
    const all = await businessRepository.list(filters({}))

    expect(withoutSite.total).toBe(2)
    expect(withSite.total).toBe(1)
    expect(all.total).toBe(3)
  })

  it("combines rating and city filters", async () => {
    await persistPlaces(
      [
        place({ externalId: "1", rating: 4.8, address: { city: "São Paulo" } }),
        place({ externalId: "2", rating: 3.2, address: { city: "São Paulo" } }),
        place({ externalId: "3", rating: 4.9, address: { city: "Santos" } }),
      ],
      "000000000000000000000001"
    )

    const result = await businessRepository.list(
      filters({ minRating: "4.5", city: "São Paulo" })
    )

    expect(result.total).toBe(1)
    expect(result.items[0].externalId).toBe("1")
  })

  it("paginates the result set", async () => {
    await persistPlaces(
      Array.from({ length: 12 }, (_, index) =>
        place({ externalId: `p-${index}` })
      ),
      "000000000000000000000001"
    )

    const page = await businessRepository.list(
      filters({ page: "2", pageSize: "5" })
    )

    expect(page.items).toHaveLength(5)
    expect(page.total).toBe(12)
    expect(page.totalPages).toBe(3)
  })

  it("computes aggregate stats", async () => {
    await persistPlaces(
      [
        place({
          externalId: "a",
          website: "https://a.com.br",
          phone: "1199999",
        }),
        place({ externalId: "b" }),
      ],
      "000000000000000000000001"
    )

    const stats = await businessRepository.stats()

    expect(stats.total).toBe(2)
    expect(stats.withWebsite).toBe(1)
    expect(stats.withoutWebsite).toBe(1)
    expect(stats.withPhone).toBe(1)
  })
})

describe("businessRepository.update", () => {
  it("clears fields passed as undefined instead of keeping stale values", async () => {
    await persistPlaces(
      [place({ externalId: "u1", website: "https://u1.com.br" })],
      "000000000000000000000001"
    )

    const stored = await BusinessModel.findOne({ externalId: "u1" }).lean()
    const id = String(stored?._id)

    // First pass fails and records an error.
    await businessRepository.update(id, {
      "enrichment.error": "fetch failed",
      status: "ENRICHMENT_FAILED",
    })

    // Second pass succeeds, so the previous error must not survive.
    const updated = await businessRepository.update(id, {
      "enrichment.websiteStatus": 200,
      "enrichment.error": undefined,
      status: "ENRICHED",
    })

    expect(updated?.status).toBe("ENRICHED")
    expect(updated?.enrichment.error).toBeUndefined()
    expect(updated?.enrichment.websiteStatus).toBe(200)
  })
})

describe("businessRepository.stats — métricas de enriquecimento", () => {
  it("separa tentativas de enriquecimentos bem-sucedidos", async () => {
    await persistPlaces(
      [
        place({ externalId: "s1", website: "https://a.com.br" }),
        place({ externalId: "s2", website: "https://b.com.br" }),
        place({ externalId: "s3", website: "https://c.com.br" }),
        place({ externalId: "s4" }),
      ],
      "000000000000000000000001"
    )

    const all = await BusinessModel.find().lean()
    const byExternal = new Map(all.map((b) => [b.externalId, String(b._id)]))

    // One succeeded, one failed, one never attempted.
    await businessRepository.update(byExternal.get("s1")!, {
      "enrichment.enrichedAt": new Date(),
      "enrichment.emails": ["a@a.com.br"],
      status: "ENRICHED",
    })
    await businessRepository.update(byExternal.get("s2")!, {
      "enrichment.enrichedAt": new Date(),
      "enrichment.error": "O site respondeu com status 403",
      status: "ENRICHMENT_FAILED",
    })

    const stats = await businessRepository.stats()

    expect(stats.total).toBe(4)
    expect(stats.withWebsite).toBe(3)
    // Both processed, but only one yielded data.
    expect(stats.attempted).toBe(2)
    expect(stats.enriched).toBe(1)
    expect(stats.enrichmentFailed).toBe(1)
  })

  it("não conta empresas sem website como enriquecíveis", async () => {
    await persistPlaces(
      [
        place({ externalId: "n1" }),
        place({ externalId: "n2" }),
        place({ externalId: "n3", website: "https://x.com.br" }),
      ],
      "000000000000000000000001"
    )

    const stats = await businessRepository.stats()

    // The coverage denominator is withWebsite, never total.
    expect(stats.total).toBe(3)
    expect(stats.withWebsite).toBe(1)
    expect(stats.withoutWebsite).toBe(2)
  })
})

describe("businessService.exportCsv", () => {
  it("exporta todos os canais de contato, não só o Instagram", async () => {
    await persistPlaces(
      [
        place({
          externalId: "c1",
          website: "https://c1.com.br",
          phone: "+5511999998888",
        }),
      ],
      "000000000000000000000001"
    )

    const stored = await BusinessModel.findOne({ externalId: "c1" }).lean()
    await businessRepository.update(String(stored?._id), {
      "enrichment.emails": ["a@c1.com.br", "b@c1.com.br"],
      "enrichment.socials.instagram": "c1oficial",
      "enrichment.socials.facebook": "c1page",
      "enrichment.socials.linkedin": "company/c1",
      "enrichment.socials.whatsapp": "5511999998888",
      "enrichment.technologies": ["WordPress", "Meta Pixel"],
    })

    const csv = await businessService.exportCsv(filters({}))
    const [header, row] = csv.split("\n")

    for (const column of [
      "Facebook",
      "LinkedIn",
      "WhatsApp",
      "Tecnologias",
      "Bairro",
      "Google Maps",
    ]) {
      expect(header).toContain(column)
    }

    expect(row).toContain("c1page")
    expect(row).toContain("company/c1")
    expect(row).toContain("a@c1.com.br; b@c1.com.br")
    expect(row).toContain("WordPress; Meta Pixel")
  })

  it("neutraliza fórmulas sem corromper números", async () => {
    await persistPlaces(
      [
        place({
          externalId: "c2",
          // A name crafted to execute if pasted into a spreadsheet.
          name: '=HYPERLINK("http://evil")',
          phone: "+5511988887777",
        }),
      ],
      "000000000000000000000001"
    )

    const csv = await businessService.exportCsv(filters({}))

    // The formula is defused with a leading quote...
    expect(csv).toContain("\"'=HYPERLINK")
    // ...while the phone keeps its leading plus sign.
    expect(csv).toContain('"+5511988887777"')
  })

  it("escapa aspas dentro de um valor", async () => {
    await persistPlaces(
      [place({ externalId: "c3", name: 'Bar do "Zé"' })],
      "000000000000000000000001"
    )

    const csv = await businessService.exportCsv(filters({}))
    expect(csv).toContain('Bar do ""Zé""')
  })
})

describe("telefone e país", () => {
  it("classifica o telefone ao coletar e filtra por país e WhatsApp", async () => {
    await persistPlaces(
      [
        place({
          externalId: "br-cel",
          phone: "+5511999990001",
          address: { country: "BR" },
        }),
        place({
          externalId: "br-fixo",
          phone: "+551133334444",
          address: { country: "BR" },
        }),
        place({
          externalId: "pt-cel",
          phone: "+351912345678",
          address: { country: "PT" },
        }),
        // No country anywhere: counts as Brazil.
        place({ externalId: "sem-pais", address: {} }),
      ],
      "000000000000000000000001"
    )

    const types = await BusinessModel.find()
      .sort({ externalId: 1 })
      .lean<{ externalId: string; phoneType?: string }[]>()
    expect(
      Object.fromEntries(types.map((item) => [item.externalId, item.phoneType]))
    ).toEqual({
      "br-cel": "MOBILE",
      "br-fixo": "FIXED_LINE",
      "pt-cel": "MOBILE",
      "sem-pais": undefined,
    })

    expect((await businessRepository.countries()).sort()).toEqual(["BR", "PT"])

    const names = async (input: Record<string, unknown>) =>
      (await businessRepository.list(filters(input))).items
        .map((item) => item.externalId)
        .sort()

    expect(await names({ country: "PT" })).toEqual(["pt-cel"])
    expect(await names({ country: "BR" })).toEqual([
      "br-cel",
      "br-fixo",
      "sem-pais",
    ])
    expect(await names({ whatsapp: "yes" })).toEqual(["br-cel", "pt-cel"])
    expect(await names({ whatsapp: "yes", country: "BR" })).toEqual(["br-cel"])
  })

  it("preenche o tipo de leads antigos e recalcula ao editar o telefone", async () => {
    const legacy = await BusinessModel.create({
      externalId: "antigo",
      source: "manual",
      name: "Antigo",
      phone: "(11) 99999-0001",
    })
    expect(await businessRepository.backfillPhoneFields()).toBe(1)
    expect(
      (await businessRepository.findById(String(legacy._id)))?.phoneType
    ).toBe("MOBILE")

    const edited = await businessRepository.update(String(legacy._id), {
      phone: "(11) 3333-4444",
    })
    expect(edited?.phoneType).toBe("FIXED_LINE")
  })
})
