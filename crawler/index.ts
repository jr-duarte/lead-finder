/**
 * Crawler entry point. Kept independent of Next.js (requirement 10) so it can
 * run from the CLI: `npm run crawler -- --category "Restaurante" ...`
 */
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })
loadEnv({ path: ".env", override: false })

import { disconnectFromDatabase } from "@/lib/mongoose"
import { searchRepository } from "@/repositories/search.repository"
import { runCollectSearch } from "@crawler/workers/collect.worker"
import type { PlaceSourceName } from "@crawler/sources"

type CliArgs = Record<string, string>

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--")) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith("--")) {
      args[key] = next
      index += 1
    } else {
      args[key] = "true"
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const params = {
    category: args.category ?? "Restaurante",
    location: args.location ?? "São Paulo, SP",
    latitude: Number(args.lat ?? -23.5505),
    longitude: Number(args.lng ?? -46.6333),
    radiusMeters: Number(args.radius ?? 3000),
    limit: Number(args.limit ?? 50),
  }

  const source = (process.env.PLACES_SOURCE ?? "mock") as PlaceSourceName

  console.log(
    `[crawler] iniciando coleta: ${params.category} em ${params.location} (fonte: ${source})`
  )

  const search = await searchRepository.create(params, source)

  const stats = await runCollectSearch(search.id, params, {
    source,
    overpassEndpoint:
      process.env.OVERPASS_ENDPOINT ??
      "https://overpass-api.de/api/interpreter",
    userAgent:
      process.env.CRAWLER_USER_AGENT ?? "LeadFinder/1.0 (+local research tool)",
    timeoutMs: Number(process.env.CRAWLER_TIMEOUT_MS ?? 15000),
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    googleEndpoint: process.env.GOOGLE_PLACES_ENDPOINT,
  })

  console.log(
    `[crawler] busca #${search.code} concluída:`,
    `${stats.found} encontradas, ${stats.created} novas,`,
    `${stats.updated} atualizadas, ${stats.duplicated} duplicadas`
  )

  await disconnectFromDatabase()
}

main().catch(async (error) => {
  console.error("[crawler] falhou:", error)
  await disconnectFromDatabase()
  process.exit(1)
})
