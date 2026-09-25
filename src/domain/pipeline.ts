/** Prospecting funnel: the stage a lead occupies on the board. */

export const PIPELINE_STAGES = [
  "NEW",
  "CONTACTED",
  "REPLIED",
  "MEETING",
  "PROPOSAL",
  "WON",
  "LOST",
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  NEW: "Novo",
  CONTACTED: "Contatado",
  REPLIED: "Respondeu",
  MEETING: "Reunião",
  PROPOSAL: "Proposta",
  WON: "Ganho",
  LOST: "Perdido",
}

/**
 * Board column order. WON and LOST close the funnel and are rendered last.
 */
export const PIPELINE_COLUMNS: PipelineStage[] = [
  "NEW",
  "CONTACTED",
  "REPLIED",
  "MEETING",
  "PROPOSAL",
  "WON",
  "LOST",
]

export const CLOSED_STAGES: PipelineStage[] = ["WON", "LOST"]

export function isClosedStage(stage: PipelineStage): boolean {
  return CLOSED_STAGES.includes(stage)
}

/**
 * A lead is only on the board once it has a stage; leads collected but never
 * picked stay out of the funnel.
 */
export type PipelineEntry = {
  stage: PipelineStage
  /** Ordering within a column, so cards keep their manual position. */
  position: number
  enteredAt: Date
  movedAt?: Date
  note?: string
}
