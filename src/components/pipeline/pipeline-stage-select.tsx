"use client"

import { KanbanSquare } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  PIPELINE_COLUMNS,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/domain/pipeline"

/**
 * Moves a lead between funnel stages from outside the board, so the detail
 * page does not require a round trip to the kanban.
 */
export function PipelineStageSelect({
  stage,
  onChange,
  disabled,
}: {
  stage: PipelineStage
  onChange: (stage: PipelineStage) => void
  disabled?: boolean
}) {
  return (
    <Select
      value={stage}
      onValueChange={(value) => onChange(value as PipelineStage)}
      disabled={disabled}
    >
      <SelectTrigger className="w-44" aria-label="Etapa no funil">
        <KanbanSquare className="size-4 opacity-70" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PIPELINE_COLUMNS.map((option) => (
          <SelectItem key={option} value={option}>
            {PIPELINE_STAGE_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
