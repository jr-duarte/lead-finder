import type { Search } from "@/domain/search"
import { getEnv } from "@/lib/env"
import { searchRepository } from "@/repositories/search.repository"
import type { SearchFormData } from "@/schemas/search"
import type { PlaceSourceName, SourceConfig } from "@crawler/sources"
import { runCollectSearch } from "@crawler/workers/collect.worker"
import type { Paginated } from "@/repositories/business.repository"

function sourceConfig(): SourceConfig {
  const env = getEnv()
  return {
    source: env.PLACES_SOURCE as PlaceSourceName,
    overpassEndpoint: env.OVERPASS_ENDPOINT,
    userAgent: env.CRAWLER_USER_AGENT,
    timeoutMs: env.CRAWLER_TIMEOUT_MS,
    googleApiKey: env.GOOGLE_MAPS_API_KEY,
    googleEndpoint: env.GOOGLE_PLACES_ENDPOINT,
  }
}

export const searchService = {
  list(page: number, pageSize: number): Promise<Paginated<Search>> {
    return searchRepository.list(page, pageSize)
  },

  getById(id: string): Promise<Search | null> {
    return searchRepository.findById(id)
  },

  /**
   * Creates the search and kicks off collection without blocking the request,
   * so the UI can immediately poll for progress.
   */
  async start(input: SearchFormData): Promise<Search> {
    const config = sourceConfig()
    const search = await searchRepository.create(input, config.source)

    void runCollectSearch(search.id, input, config).catch((error) => {
      console.error(`[search:${search.code}] coleta falhou`, error)
    })

    return search
  },

  async cancel(id: string): Promise<Search | null> {
    const search = await searchRepository.findById(id)
    if (!search) return null

    if (search.status === "COMPLETED" || search.status === "FAILED") {
      return search
    }

    return searchRepository.update(id, {
      status: "CANCELLED",
      finishedAt: new Date(),
    })
  },
}
