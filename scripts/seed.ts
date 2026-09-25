/**
 * Seeds the local database with a few searches so the UI has data to show.
 * Safe to re-run: places are upserted by (source, externalId).
 */
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })
loadEnv({ path: ".env", override: false })

import { disconnectFromDatabase } from "@/lib/mongoose"
import { searchRepository } from "@/repositories/search.repository"
import { runCollectSearch } from "@crawler/workers/collect.worker"

const SEEDS = [
  {
    category: "Restaurante",
    location: "São Paulo, SP",
    latitude: -23.5505,
    longitude: -46.6333,
    radiusMeters: 5000,
    limit: 60,
  },
  {
    category: "Academia",
    location: "São Paulo, SP",
    latitude: -23.5629,
    longitude: -46.6544,
    radiusMeters: 4000,
    limit: 40,
  },
  {
    category: "Padaria",
    location: "Rio de Janeiro, RJ",
    latitude: -22.9068,
    longitude: -43.1729,
    radiusMeters: 5000,
    limit: 45,
  },
]

async function main(): Promise<void> {
  for (const params of SEEDS) {
    const search = await searchRepository.create(params, "mock")

    const stats = await runCollectSearch(search.id, params, {
      source: "mock",
      overpassEndpoint: "",
      userAgent: "LeadFinder/seed",
      timeoutMs: 15000,
    })

    console.log(
      `[seed] #${search.code} ${params.category} @ ${params.location}:`,
      `${stats.created} novas, ${stats.updated} atualizadas`
    )
  }

  console.log("[seed] concluído.")
  await disconnectFromDatabase()
}

main().catch(async (error) => {
  console.error("[seed] falhou:", error)
  await disconnectFromDatabase()
  process.exit(1)
})
