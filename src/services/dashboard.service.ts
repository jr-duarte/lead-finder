import { businessRepository } from "@/repositories/business.repository"
import { searchRepository } from "@/repositories/search.repository"

export type DashboardData = {
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
  recentSearches: Awaited<ReturnType<typeof searchRepository.recent>>
}

export const dashboardService = {
  async getData(): Promise<DashboardData> {
    const [stats, totalSearches, topCategories, timeline, recentSearches] =
      await Promise.all([
        businessRepository.stats(),
        searchRepository.count(),
        businessRepository.topCategories(6),
        businessRepository.collectionTimeline(14),
        searchRepository.recent(5),
      ])

    return {
      kpis: {
        total: stats.total,
        withoutWebsite: stats.withoutWebsite,
        withWebsite: stats.withWebsite,
        enriched: stats.enriched,
        withPhone: stats.withPhone,
        withInstagram: stats.withInstagram,
        totalSearches,
      },
      avgRating: stats.avgRating,
      topCategories,
      timeline,
      recentSearches,
    }
  },
}
