import type { Business } from "@/domain/business"
import {
  PIPELINE_COLUMNS,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/domain/pipeline"
import { pipelineRepository } from "@/repositories/pipeline.repository"

export type BoardColumn = {
  stage: PipelineStage
  label: string
  cards: Business[]
}

export const pipelineService = {
  /** The board grouped into columns, in funnel order. */
  async board(): Promise<BoardColumn[]> {
    const leads = await pipelineRepository.board()

    return PIPELINE_COLUMNS.map((stage) => ({
      stage,
      label: PIPELINE_STAGE_LABELS[stage],
      cards: leads
        .filter((lead) => lead.pipeline?.stage === stage)
        .sort(
          (a, b) => (a.pipeline?.position ?? 0) - (b.pipeline?.position ?? 0)
        ),
    }))
  },

  add(ids: string[], stage: PipelineStage): Promise<number> {
    return pipelineRepository.add(ids, stage)
  },

  move(
    id: string,
    stage: PipelineStage,
    position?: number
  ): Promise<Business | null> {
    return pipelineRepository.move(id, stage, position)
  },

  setNote(id: string, note: string): Promise<Business | null> {
    return pipelineRepository.setNote(id, note)
  },

  remove(ids: string[]): Promise<number> {
    return pipelineRepository.remove(ids)
  },

  countByStage(): Promise<Record<string, number>> {
    return pipelineRepository.countByStage()
  },
}
