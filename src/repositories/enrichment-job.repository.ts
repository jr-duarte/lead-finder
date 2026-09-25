import { Types } from "mongoose"

import type {
  EnrichmentJob,
  EnrichmentJobStats,
  EnrichmentJobStatus,
} from "@/domain/enrichment-job"
import { connectToDatabase } from "@/lib/mongoose"
import {
  EnrichmentJobModel,
  type EnrichmentJobDocument,
} from "@/models/enrichment-job.model"

type RawJob = EnrichmentJobDocument & {
  _id: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

function toJob(raw: RawJob): EnrichmentJob {
  return {
    id: String(raw._id),
    status: raw.status as EnrichmentJobStatus,
    stats: {
      total: raw.stats?.total ?? 0,
      processed: raw.stats?.processed ?? 0,
      succeeded: raw.stats?.succeeded ?? 0,
      failed: raw.stats?.failed ?? 0,
      skipped: raw.stats?.skipped ?? 0,
    },
    progress: raw.progress ?? 0,
    renderJavaScript: raw.renderJavaScript ?? false,
    pendingIds: raw.pendingIds ?? [],
    error: raw.error ?? undefined,
    startedAt: raw.startedAt ?? undefined,
    finishedAt: raw.finishedAt ?? undefined,
    heartbeatAt: raw.heartbeatAt ?? undefined,
    createdAt: raw.createdAt ?? new Date(),
    updatedAt: raw.updatedAt ?? new Date(),
  }
}

export const enrichmentJobRepository = {
  async create(
    ids: string[],
    renderJavaScript: boolean
  ): Promise<EnrichmentJob> {
    await connectToDatabase()

    const created = await EnrichmentJobModel.create({
      status: "PENDING",
      renderJavaScript,
      pendingIds: ids,
      stats: { total: ids.length, processed: 0, succeeded: 0, failed: 0 },
      heartbeatAt: new Date(),
    })

    return toJob(created.toObject() as RawJob)
  },

  async findById(id: string): Promise<EnrichmentJob | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null

    const raw = await EnrichmentJobModel.findById(id).lean<RawJob>().exec()
    return raw ? toJob(raw) : null
  },

  async update(
    id: string,
    patch: Partial<{
      status: EnrichmentJobStatus
      stats: EnrichmentJobStats
      progress: number
      pendingIds: string[]
      error: string
      startedAt: Date
      finishedAt: Date
      heartbeatAt: Date
    }>
  ): Promise<EnrichmentJob | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null

    const raw = await EnrichmentJobModel.findByIdAndUpdate(
      id,
      { $set: patch },
      { returnDocument: "after" }
    )
      .lean<RawJob>()
      .exec()

    return raw ? toJob(raw) : null
  },

  /**
   * Records progress for one processed business: the id leaves the pending
   * list and the counters advance, all in a single atomic update so a crash
   * cannot double-count.
   */
  async recordProgress(
    id: string,
    businessId: string,
    ok: boolean,
    progress: number,
    skipped = false
  ): Promise<void> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return

    await EnrichmentJobModel.updateOne(
      { _id: id },
      {
        $pull: { pendingIds: businessId },
        $inc: {
          "stats.processed": 1,
          // A skipped business counts as processed but is neither a success
          // nor a failure, so the ratio stays meaningful.
          ...(skipped
            ? { "stats.skipped": 1 }
            : ok
              ? { "stats.succeeded": 1 }
              : { "stats.failed": 1 }),
        },
        $set: { progress, heartbeatAt: new Date() },
      }
    ).exec()
  },

  async latest(limit = 5): Promise<EnrichmentJob[]> {
    await connectToDatabase()

    const raw = await EnrichmentJobModel.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<RawJob[]>()
      .exec()

    return raw.map(toJob)
  },

  /** The most recent job that is still active, if any. */
  async activeJob(): Promise<EnrichmentJob | null> {
    await connectToDatabase()

    const raw = await EnrichmentJobModel.findOne({
      status: { $in: ["PENDING", "RUNNING"] },
    })
      .sort({ createdAt: -1 })
      .lean<RawJob>()
      .exec()

    return raw ? toJob(raw) : null
  },

  /**
   * Fails jobs left RUNNING by a process restart. Called on the first request
   * after boot, so the UI never polls a job that nobody is working on.
   */
  async failStaleJobs(staleAfterMs: number): Promise<number> {
    await connectToDatabase()

    const threshold = new Date(Date.now() - staleAfterMs)

    const result = await EnrichmentJobModel.updateMany(
      {
        status: { $in: ["PENDING", "RUNNING"] },
        $or: [
          { heartbeatAt: { $lt: threshold } },
          { heartbeatAt: { $exists: false } },
        ],
      },
      {
        $set: {
          status: "FAILED",
          error:
            "Execução interrompida (o servidor foi reiniciado). Você pode retomar os itens restantes.",
          finishedAt: new Date(),
        },
      }
    ).exec()

    return result.modifiedCount ?? 0
  },
}

export { toJob }
