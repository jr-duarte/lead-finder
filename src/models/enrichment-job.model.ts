import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

import { ENRICHMENT_JOB_STATUS } from "@/domain/enrichment-job"

const statsSchema = new Schema(
  {
    total: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    succeeded: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
  },
  { _id: false }
)

const enrichmentJobSchema = new Schema(
  {
    status: {
      type: String,
      enum: ENRICHMENT_JOB_STATUS,
      default: "PENDING",
      index: true,
    },
    stats: { type: statsSchema, default: () => ({}) },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    renderJavaScript: { type: Boolean, default: false },
    pendingIds: { type: [String], default: [] },
    error: String,
    startedAt: Date,
    finishedAt: Date,
    heartbeatAt: Date,
  },
  { timestamps: true, collection: "enrichment_jobs" }
)

enrichmentJobSchema.index({ createdAt: -1 })

export type EnrichmentJobDocument = InferSchemaType<typeof enrichmentJobSchema>

export const EnrichmentJobModel: Model<EnrichmentJobDocument> =
  (models.EnrichmentJob as Model<EnrichmentJobDocument>) ??
  model<EnrichmentJobDocument>("EnrichmentJob", enrichmentJobSchema)
