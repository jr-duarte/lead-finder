import type { Business } from "@/domain/business"
import {
  computeJobProgress,
  isJobTerminal,
  type EnrichmentJob,
} from "@/domain/enrichment-job"
import { getEnv } from "@/lib/env"
import { businessRepository } from "@/repositories/business.repository"
import { enrichmentJobRepository } from "@/repositories/enrichment-job.repository"
import { businessFiltersSchema } from "@/schemas/business"
import {
  enrichMany,
  type EnrichmentOutcome,
  type EnrichmentTarget,
} from "@crawler/workers/enrich.worker"

/** A job whose heartbeat is older than this was killed by a restart. */
const STALE_JOB_MS = 2 * 60 * 1000

export type EnrichmentSummary = {
  requested: number
  processed: number
  succeeded: number
  failed: number
  skipped: number
}

export const enrichmentService = {
  /**
   * Enriches the given businesses and persists the outcome. Businesses with no
   * website are marked as failed with an explicit reason rather than silently
   * skipped, so the UI can show why.
   */
  async enrich(
    ids: string[],
    options: { renderJavaScript?: boolean } = {}
  ): Promise<EnrichmentSummary> {
    const env = getEnv()
    const businesses = await businessRepository.findManyByIds(ids)

    const targets = businesses.map(toTarget)

    const outcomes = await enrichMany(targets, {
      concurrency: env.CRAWLER_CONCURRENCY,
      delayMs: env.CRAWLER_REQUEST_DELAY_MS,
      timeoutMs: env.CRAWLER_TIMEOUT_MS,
      userAgent: env.CRAWLER_USER_AGENT,
      maxContactPages: env.CRAWLER_MAX_CONTACT_PAGES,
      cnpjLookupEndpoint: env.CNPJ_LOOKUP_ENDPOINT,
      renderJavaScript: options.renderJavaScript ?? false,
    })

    await Promise.all(outcomes.map((outcome) => persistOutcome(outcome)))

    return {
      requested: ids.length,
      processed: outcomes.length,
      succeeded: outcomes.filter((outcome) => outcome.ok).length,
      failed: outcomes.filter((outcome) => !outcome.ok && outcome.error).length,
      skipped: ids.length - outcomes.length,
    }
  },

  /** Enriches a batch of not-yet-enriched businesses that do have a website. */
  async enrichPending(
    limit: number,
    options: { renderJavaScript?: boolean } = {}
  ): Promise<EnrichmentSummary> {
    const { items } = await businessRepository.list(
      pendingFilters({ pageSize: limit })
    )

    if (items.length === 0) {
      return { requested: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 }
    }

    return this.enrich(
      items.map((business) => business.id),
      options
    )
  },

  async stats() {
    const [stats, pending] = await Promise.all([
      businessRepository.stats(),
      businessRepository.list(pendingFilters({ pageSize: 1 })),
    ])

    return {
      total: stats.total,
      enriched: stats.enriched,
      attempted: stats.attempted,
      failed: stats.enrichmentFailed,
      withWebsite: stats.withWebsite,
      pending: pending.total,
    }
  },
}

/**
 * "Pending enrichment" = has a website but was never enriched. Built through
 * the schema so every default is applied consistently.
 */
function pendingFilters({ pageSize }: { pageSize: number }) {
  return businessFiltersSchema.parse({
    website: "yes",
    status: "NEW",
    sortBy: "collectedAt",
    sortDir: "desc",
    page: 1,
    pageSize,
  })
}

function toTarget(business: Business): EnrichmentTarget {
  return {
    id: business.id,
    name: business.name,
    website: business.website,
    cnpj: business.cnpj,
  }
}

async function persistOutcome(outcome: EnrichmentOutcome): Promise<void> {
  await businessRepository.update(outcome.id, {
    "enrichment.enrichedAt": outcome.enrichedAt,
    "enrichment.emails": outcome.emails,
    "enrichment.socials.instagram": outcome.socials.instagram,
    "enrichment.socials.facebook": outcome.socials.facebook,
    "enrichment.socials.whatsapp": outcome.socials.whatsapp,
    "enrichment.socials.linkedin": outcome.socials.linkedin,
    "enrichment.websiteStatus": outcome.websiteStatus,
    "enrichment.websiteTitle": outcome.websiteTitle,
    "enrichment.websiteBroken": outcome.websiteBroken,
    "enrichment.technologies": outcome.technologies,
    "enrichment.error": outcome.error,
    status: outcome.ok ? "ENRICHED" : "ENRICHMENT_FAILED",
    // Written only when present: a run that finds nothing must not erase a
    // CNPJ typed by the user or a record from an earlier lookup.
    ...(outcome.cnpj ? { cnpj: outcome.cnpj } : {}),
    ...(outcome.registry ? { registry: outcome.registry } : {}),
    ...(outcome.registryError
      ? { "registry.error": outcome.registryError }
      : {}),
  })
}

/**
 * Runs a job to completion, persisting each outcome as it happens so progress
 * survives a page reload — and so a restart loses at most the item in flight.
 */
async function processJob(jobId: string): Promise<void> {
  const env = getEnv()

  const job = await enrichmentJobRepository.findById(jobId)
  if (!job || isJobTerminal(job.status)) return

  await enrichmentJobRepository.update(jobId, {
    status: "RUNNING",
    startedAt: job.startedAt ?? new Date(),
    heartbeatAt: new Date(),
  })

  try {
    const businesses = await businessRepository.findManyByIds(job.pendingIds)

    const targets = businesses.map(toTarget)

    await enrichMany(targets, {
      concurrency: env.CRAWLER_CONCURRENCY,
      delayMs: env.CRAWLER_REQUEST_DELAY_MS,
      timeoutMs: env.CRAWLER_TIMEOUT_MS,
      userAgent: env.CRAWLER_USER_AGENT,
      maxContactPages: env.CRAWLER_MAX_CONTACT_PAGES,
      cnpjLookupEndpoint: env.CNPJ_LOOKUP_ENDPOINT,
      renderJavaScript: job.renderJavaScript,

      // Cancellation is requested by writing to the job, so it is read back
      // rather than held in memory.
      shouldStop: async () => {
        const current = await enrichmentJobRepository.findById(jobId)
        return current?.status === "CANCELLED"
      },

      onProgress: async (outcome) => {
        // A cancelled target was never attempted, so it stays pending.
        if (outcome.cancelled) return

        await persistOutcome(outcome)

        const current = await enrichmentJobRepository.findById(jobId)
        const processed = (current?.stats.processed ?? 0) + 1

        await enrichmentJobRepository.recordProgress(
          jobId,
          outcome.id,
          outcome.ok,
          computeJobProgress(processed, current?.stats.total ?? 0),
          outcome.skipped
        )
      },
    })

    const finished = await enrichmentJobRepository.findById(jobId)

    // A cancelled job keeps its status; everything else completed.
    if (finished?.status !== "CANCELLED") {
      await enrichmentJobRepository.update(jobId, {
        status: "COMPLETED",
        progress: 100,
        finishedAt: new Date(),
      })
    }
  } catch (error) {
    await enrichmentJobRepository.update(jobId, {
      status: "FAILED",
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido no enriquecimento",
      finishedAt: new Date(),
    })
  }
}

export const enrichmentJobService = {
  /**
   * Creates a job and starts it without blocking the request, so closing the
   * page does not interrupt the run.
   */
  async start(
    ids: string[],
    options: { renderJavaScript?: boolean } = {}
  ): Promise<EnrichmentJob> {
    await enrichmentJobRepository.failStaleJobs(STALE_JOB_MS)

    const job = await enrichmentJobRepository.create(
      ids,
      options.renderJavaScript ?? false
    )

    void processJob(job.id).catch((error) => {
      console.error(`[enrichment:${job.id}] falhou`, error)
    })

    return job
  },

  /** Starts a job over the businesses pending enrichment. */
  async startPending(
    limit: number,
    options: { renderJavaScript?: boolean } = {}
  ): Promise<EnrichmentJob | null> {
    const { items } = await businessRepository.list(
      pendingFilters({ pageSize: limit })
    )

    if (items.length === 0) return null

    return this.start(
      items.map((business) => business.id),
      options
    )
  },

  /** Re-queues the items a failed or cancelled job never reached. */
  async resume(jobId: string): Promise<EnrichmentJob | null> {
    const job = await enrichmentJobRepository.findById(jobId)
    if (!job || job.pendingIds.length === 0) return null

    return this.start(job.pendingIds, {
      renderJavaScript: job.renderJavaScript,
    })
  },

  async cancel(jobId: string): Promise<EnrichmentJob | null> {
    const job = await enrichmentJobRepository.findById(jobId)
    if (!job || isJobTerminal(job.status)) return job

    return enrichmentJobRepository.update(jobId, {
      status: "CANCELLED",
      finishedAt: new Date(),
    })
  },

  async getById(jobId: string): Promise<EnrichmentJob | null> {
    // Surfaces orphaned jobs as failed instead of leaving the UI polling.
    await enrichmentJobRepository.failStaleJobs(STALE_JOB_MS)
    return enrichmentJobRepository.findById(jobId)
  },

  async active(): Promise<EnrichmentJob | null> {
    await enrichmentJobRepository.failStaleJobs(STALE_JOB_MS)
    return enrichmentJobRepository.activeJob()
  },

  latest(limit = 5): Promise<EnrichmentJob[]> {
    return enrichmentJobRepository.latest(limit)
  },
}
