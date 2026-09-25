/** Domain definitions for a collection run ("busca"). */

export const SEARCH_STATUS = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const

export type SearchStatus = (typeof SEARCH_STATUS)[number]

export const SEARCH_STATUS_LABELS: Record<SearchStatus, string> = {
  PENDING: "Pendente",
  RUNNING: "Em execução",
  COMPLETED: "Concluída",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
}

export const TERMINAL_SEARCH_STATUSES: SearchStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]

export type SearchParams = {
  category: string
  location: string
  /** Optional: text-based sources (Google) resolve the area from `location`. */
  latitude?: number
  longitude?: number
  radiusMeters: number
  limit: number
}

export type SearchStats = {
  found: number
  created: number
  updated: number
  duplicated: number
}

export type Search = {
  id: string
  code: number
  params: SearchParams
  status: SearchStatus
  stats: SearchStats
  progress: number
  source: string
  error?: string
  startedAt?: Date
  finishedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export function isTerminal(status: SearchStatus): boolean {
  return TERMINAL_SEARCH_STATUSES.includes(status)
}

/** Progress as an integer percentage, clamped to 0..100. */
export function computeProgress(found: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.round((found / limit) * 100))
}
