import type { PipelineStage } from "@/domain/pipeline"

/** A dated note a user writes about a lead. */

export type Note = {
  id: string
  businessId: string
  content: string
  /** Funnel stage the lead was in when the note was written. */
  stage?: PipelineStage
  createdAt: Date
  updatedAt: Date
}
