import { PIPELINE_COLUMNS, isClosedStage } from "@/domain/pipeline"
import { businessRepository } from "@/repositories/business.repository"
import { pipelineRepository } from "@/repositories/pipeline.repository"
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
  /**
   * Funnel summary. "inProgress" sums every open stage, so the three numbers
   * account for the whole board.
   */
  funnel: {
    won: number
    lost: number
    inProgress: number
    total: number
    /** Share of closed deals that were won. */
    winRate: number
  }
  avgRating: number
  topCategories: { category: string; count: number }[]
  timeline: { date: string; count: number }[]
  recentSearches: Awaited<ReturnType<typeof searchRepository.recent>>
}

export const dashboardService = {
  async getData(): Promise<DashboardData> {
    const [
      stats,
      totalSearches,
      topCategories,
      timeline,
      recentSearches,
      stageCounts,
    ] = await Promise.all([
      businessRepository.stats(),
      searchRepository.count(),
      businessRepository.topCategories(6),
      businessRepository.collectionTimeline(14),
      searchRepository.recent(5),
      pipelineRepository.countByStage(),
    ])

    const won = stageCounts.WON ?? 0
    const lost = stageCounts.LOST ?? 0

    // Everything that is neither won nor lost is still being worked.
    const inProgress = PIPELINE_COLUMNS.filter(
      (stage) => !isClosedStage(stage)
    ).reduce((sum, stage) => sum + (stageCounts[stage] ?? 0), 0)

    const closed = won + lost

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
      funnel: {
        won,
        lost,
        inProgress,
        total: won + lost + inProgress,
        winRate: closed > 0 ? (won / closed) * 100 : 0,
      },
      avgRating: stats.avgRating,
      topCategories,
      timeline,
      recentSearches,
    }
  },
}
