import type { Business } from "@/domain/business"
import type { EnrichmentJob } from "@/domain/enrichment-job"
import type { Search } from "@/domain/search"

/** Wire format: dates arrive as ISO strings over JSON. */
export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | undefined
      ? string | undefined
      : T[K] extends object
        ? Serialized<T[K]>
        : T[K]
}

export type BusinessDTO = Serialized<Business>
export type SearchDTO = Serialized<Search>

export type PaginatedDTO<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type FilterOptionsDTO = {
  categories: string[]
  cities: string[]
  states: string[]
}

export type DashboardDTO = {
  kpis: {
    total: number
    withoutWebsite: number
    withWebsite: number
    enriched: number
    withPhone: number
    withInstagram: number
    totalSearches: number
  }
  avgRating: number
  topCategories: { category: string; count: number }[]
  timeline: { date: string; count: number }[]
  recentSearches: SearchDTO[]
}

export type EnrichmentSummaryDTO = {
  requested: number
  processed: number
  succeeded: number
  failed: number
  skipped: number
}

export type EnrichmentStatsDTO = {
  total: number
  /** Processed and yielded data. */
  enriched: number
  /** Processed at all, including failures. */
  attempted: number
  failed: number
  withWebsite: number
  pending: number
}

export type EnrichmentJobDTO = Serialized<EnrichmentJob>

export type EnrichmentJobsDTO = {
  active: EnrichmentJobDTO | null
  recent: EnrichmentJobDTO[]
}

export type SourceInfoDTO = {
  source: "mock" | "osm" | "google"
  label: string
  maxResults: number
  requiresCoordinates: boolean
  hasRatings: boolean
}
