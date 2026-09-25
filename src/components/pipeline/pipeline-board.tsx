"use client"

import * as React from "react"
import { Inbox } from "lucide-react"

import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { PipelineCard } from "@/components/pipeline/pipeline-card"
import type { PipelineStage } from "@/domain/pipeline"
import type { BoardColumnDTO } from "@/types/api"

/** Columns that close the funnel get a muted treatment. */
const STAGE_ACCENT: Partial<Record<PipelineStage, string>> = {
  WON: "text-success",
  LOST: "text-muted-foreground",
}

export function PipelineBoard({
  columns,
  isLoading,
  onMove,
  onRemove,
}: {
  columns: BoardColumnDTO[]
  isLoading?: boolean
  onMove: (id: string, stage: PipelineStage, position: number) => void
  onRemove: (id: string) => void
}) {
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [overStage, setOverStage] = React.useState<PipelineStage | null>(null)

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-96 w-72 shrink-0" />
        ))}
      </div>
    )
  }

  /** Drops the card at the end of the target column. */
  const handleDrop = (stage: PipelineStage, position: number) => {
    if (!draggingId) return
    onMove(draggingId, stage, position)
    setDraggingId(null)
    setOverStage(null)
  }

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-4 pb-4">
        {columns.map((column) => (
          <div
            key={column.stage}
            onDragOver={(event) => {
              event.preventDefault()
              setOverStage(column.stage)
            }}
            onDragLeave={() => setOverStage(null)}
            onDrop={(event) => {
              event.preventDefault()
              handleDrop(column.stage, column.cards.length)
            }}
            className={cn(
              "bg-muted/40 flex w-72 shrink-0 flex-col rounded-lg border transition-colors",
              overStage === column.stage && "border-primary/50 bg-primary/5"
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
              <span
                className={cn(
                  "text-sm font-medium",
                  STAGE_ACCENT[column.stage]
                )}
              >
                {column.label}
              </span>
              <Badge variant="secondary" className="tabular">
                {column.cards.length}
              </Badge>
            </div>

            <div className="flex min-h-40 flex-1 flex-col gap-2 p-2">
              {column.cards.length === 0 ? (
                <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-1.5 py-6 text-center">
                  <Inbox className="size-4" />
                  <p className="text-xs">Arraste leads para cá</p>
                </div>
              ) : (
                column.cards.map((card, index) => (
                  <div
                    key={card.id}
                    onDragOver={(event) => event.stopPropagation()}
                    onDrop={(event) => {
                      // Dropping on a card inserts above it.
                      event.preventDefault()
                      event.stopPropagation()
                      handleDrop(column.stage, index)
                    }}
                  >
                    <PipelineCard
                      business={card}
                      isDragging={draggingId === card.id}
                      onDragStart={() => setDraggingId(card.id)}
                      onDragEnd={() => {
                        setDraggingId(null)
                        setOverStage(null)
                      }}
                      onRemove={() => onRemove(card.id)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
