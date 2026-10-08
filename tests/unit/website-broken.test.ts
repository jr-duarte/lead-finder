import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { startTestDatabase } from "../helpers/db"

import { BusinessModel } from "@/models/business.model"
import {
  buildBusinessQuery,
  businessRepository,
} from "@/repositories/business.repository"
import { businessFiltersSchema } from "@/schemas/business"

let database: Awaited<ReturnType<typeof startTestDatabase>>

beforeAll(async () => {
  database = await startTestDatabase("website-broken")
}, 120_000)

afterAll(async () => {
  await database.stop()
})

describe("backfill de site fora do ar", () => {
  it("classifica os já enriquecidos pelo status e erro gravados", async () => {
    const enrichedAt = new Date()
    const lead = (name: string, extra: Record<string, unknown>) => ({
      name,
      source: "manual",
      externalId: `wb-${name}`,
      collectedAt: enrichedAt,
      website: `https://${name}.com.br`,
      ...extra,
    })

    await BusinessModel.insertMany([
      lead("ok", {
        status: "ENRICHED",
        enrichment: { enrichedAt, websiteStatus: 200 },
      }),
      lead("gone", {
        status: "ENRICHMENT_FAILED",
        enrichment: { enrichedAt, websiteStatus: 404, error: "404" },
      }),
      lead("down", {
        status: "ENRICHMENT_FAILED",
        enrichment: { enrichedAt, websiteStatus: 503, error: "503" },
      }),
      lead("blocked", {
        status: "ENRICHMENT_FAILED",
        enrichment: { enrichedAt, websiteStatus: 403, error: "403" },
      }),
      lead("offline", {
        status: "ENRICHMENT_FAILED",
        enrichment: { enrichedAt, error: "Domínio não encontrado." },
      }),
      lead("never", { status: "NEW" }),
    ])

    expect(await businessRepository.backfillWebsiteBroken()).toBe(5)
    // Already classified leads are left alone on the next start.
    expect(await businessRepository.backfillWebsiteBroken()).toBe(0)

    const broken = await BusinessModel.find(
      buildBusinessQuery(businessFiltersSchema.parse({ website: "broken" }))
    )
      .lean<{ name: string }[]>()
      .exec()

    expect(broken.map((item) => item.name).sort()).toEqual([
      "down",
      "gone",
      "offline",
    ])
  })
})
