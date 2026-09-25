import { z } from "zod"

import { PIPELINE_STAGES } from "@/domain/pipeline"

/** Adds one or more leads to the board, at the end of a column. */
export const addToPipelineSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Selecione ao menos uma empresa"),
  stage: z.enum(PIPELINE_STAGES).default("NEW"),
})

/** Moves a card, optionally reordering it within the target column. */
export const moveCardSchema = z.object({
  stage: z.enum(PIPELINE_STAGES),
  /** Index within the destination column; appended when omitted. */
  position: z.coerce.number().int().min(0).optional(),
})

export const removeFromPipelineSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
})

export const pipelineNoteSchema = z.object({
  note: z.string().trim().max(500, "A nota deve ter no máximo 500 caracteres"),
})

export type AddToPipelineInput = z.infer<typeof addToPipelineSchema>
export type MoveCardInput = z.infer<typeof moveCardSchema>
