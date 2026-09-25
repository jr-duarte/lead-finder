/** Domain definitions for a background enrichment run. */

export const ENRICHMENT_JOB_STATUS = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const

export type EnrichmentJobStatus = (typeof ENRICHMENT_JOB_STATUS)[number]

export const ENRICHMENT_JOB_STATUS_LABELS: Record<EnrichmentJobStatus, string> =
  {
    PENDING: "Na fila",
    RUNNING: "Processando",
    COMPLETED: "Concluído",
    FAILED: "Falhou",
    CANCELLED: "Cancelado",
  }

export const TERMINAL_JOB_STATUSES: EnrichmentJobStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]

export type EnrichmentJobStats = {
  total: number
  processed: number
  succeeded: number
  failed: number
  /** Processed but never enrichable (no website). */
  skipped: number
}

export type EnrichmentJob = {
  id: string
  status: EnrichmentJobStatus
  stats: EnrichmentJobStats
  progress: number
  renderJavaScript: boolean
  /** Ids still to process; shrinks as the job advances, enabling resume. */
  pendingIds: string[]
  error?: string
  startedAt?: Date
  finishedAt?: Date
  /** Heartbeat used to detect jobs orphaned by a process restart. */
  heartbeatAt?: Date
  createdAt: Date
  updatedAt: Date
}

export function isJobTerminal(status: EnrichmentJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status)
}

export function computeJobProgress(processed: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((processed / total) * 100))
}

/**
 * A running job whose heartbeat went stale was almost certainly killed by a
 * process restart, since the worker updates it after every item.
 */
export function isJobStale(
  job: Pick<EnrichmentJob, "status" | "heartbeatAt">,
  staleAfterMs: number,
  now: Date = new Date()
): boolean {
  if (job.status !== "RUNNING" && job.status !== "PENDING") return false
  if (!job.heartbeatAt) return true

  return now.getTime() - job.heartbeatAt.getTime() > staleAfterMs
}
