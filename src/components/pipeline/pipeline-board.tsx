"use client"

import * as React from "react"
import {
  DndContext,
  DragOverlay,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { Inbox } from "lucide-react"

import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  PipelineCard,
  PipelineCardContent,
} from "@/components/pipeline/pipeline-card"
import { PIPELINE_COLUMNS, type PipelineStage } from "@/domain/pipeline"
import type { BoardColumnDTO, BusinessDTO } from "@/types/api"

/** Columns that close the funnel get a muted treatment. */
const STAGE_ACCENT: Partial<Record<PipelineStage, string>> = {
  WON: "text-success",
  LOST: "text-muted-foreground",
}

/**
 * On release the overlay travels to the card's final position instead of
 * vanishing, so the eye can follow where the lead landed.
 */
const DROP_ANIMATION: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
}

/**
 * Whatever is under the pointer wins, which is what makes an empty column
 * reachable: it has no cards, so a corner-distance strategy would always
 * prefer a neighbouring column that does. The rect and corner passes are
 * fallbacks for keyboard dragging, where there is no pointer.
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) return pointerCollisions

  const rectCollisions = rectIntersection(args)
  if (rectCollisions.length > 0) return rectCollisions

  return closestCorners(args)
}

function isStage(value: string): value is PipelineStage {
  return (PIPELINE_COLUMNS as string[]).includes(value)
}

/**
 * A column that accepts cards, including when it is empty.
 *
 * `isTarget` comes from the board rather than from `isOver`, because while the
 * pointer sits on a *card* the droppable that reports `isOver` is that card,
 * not its column. Resolving the card back to its column is what lets the whole
 * destination column react during a cross-column drag.
 */
function Column({
  column,
  isEmpty,
  isTarget,
  isOrigin,
  isDragActive,
  children,
}: {
  column: BoardColumnDTO
  isEmpty: boolean
  isTarget: boolean
  isOrigin: boolean
  isDragActive: boolean
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: column.stage })

  // Only a move to a *different* column is worth announcing; reordering
  // inside the origin column already reads from the cards sliding apart.
  const isIncoming = isTarget && !isOrigin

  return (
    <div
      ref={setNodeRef}
      data-drop-target={isIncoming ? "" : undefined}
      className={cn(
        "bg-muted/40 flex w-72 shrink-0 flex-col rounded-lg border",
        "transition-[background-color,border-color,box-shadow,transform,opacity] duration-200 ease-out",
        isIncoming && "border-primary/60 bg-primary/5 scale-[1.01] shadow-md",
        // Columns that are not in play recede, so the eye is pulled to the one
        // that is about to receive the card.
        isDragActive && !isTarget && !isOrigin && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <span
          className={cn(
            "text-sm font-medium transition-colors duration-200",
            STAGE_ACCENT[column.stage],
            isIncoming && "text-primary"
          )}
        >
          {column.label}
        </span>
        <Badge
          variant="secondary"
          className={cn(
            "tabular transition-transform duration-200",
            isIncoming && "bg-primary/15 text-primary scale-110"
          )}
        >
          {column.cards.length}
        </Badge>
      </div>

      <div className="flex max-h-[calc(100vh-16rem)] min-h-40 flex-col gap-2 overflow-y-auto p-2">
        {children}

        {/* Where the card will land when it is dropped on a column that
            already has cards: a gap that grows in at the end of the list. */}
        {isIncoming && !isEmpty ? (
          <div className="border-primary/50 bg-primary/5 animate-in fade-in zoom-in-95 h-16 shrink-0 rounded-md border border-dashed duration-200" />
        ) : null}

        {isEmpty ? (
          <div
            className={cn(
              "text-muted-foreground flex h-32 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed text-center",
              "transition-[color,border-color,background-color,transform] duration-200 ease-out",
              isIncoming &&
                "border-primary/60 text-primary bg-primary/5 scale-[1.02]"
            )}
          >
            <Inbox
              className={cn(
                "size-4 transition-transform duration-200",
                isIncoming && "scale-125"
              )}
            />
            <p className="text-xs">
              {isIncoming ? "Solte para mover" : "Arraste leads para cá"}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
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
  const [dragging, setDragging] = React.useState<BusinessDTO | null>(null)
  // The column under the pointer and the one the card came from, so every
  // column can animate relative to the move in progress.
  const [overStage, setOverStage] = React.useState<PipelineStage | null>(null)
  const [originStage, setOriginStage] = React.useState<PipelineStage | null>(
    null
  )

  // Touch needs a short hold before dragging, otherwise scrolling the board
  // would start a drag. Pointer uses distance for the same reason.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const cardsById = React.useMemo(() => {
    const map = new Map<string, { card: BusinessDTO; stage: PipelineStage }>()
    for (const column of columns) {
      for (const card of column.cards) {
        map.set(card.id, { card, stage: column.stage })
      }
    }
    return map
  }, [columns])

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-96 w-72 shrink-0" />
        ))}
      </div>
    )
  }

  const reset = () => {
    setDragging(null)
    setOverStage(null)
    setOriginStage(null)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const entry = cardsById.get(String(event.active.id))
    setDragging(entry?.card ?? null)
    setOriginStage(entry?.stage ?? null)
    setOverStage(entry?.stage ?? null)
  }

  /** Resolves the droppable under the pointer — column or card — to a stage. */
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over) {
      setOverStage(null)
      return
    }

    const overId = String(over.id)
    setOverStage(
      isStage(overId) ? overId : (cardsById.get(overId)?.stage ?? null)
    )
  }

  const handleDragEnd = (event: DragEndEvent) => {
    reset()

    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const from = cardsById.get(activeId)
    if (!from) return

    // Dropping on a column appends; dropping on a card takes its index.
    if (isStage(overId)) {
      const target = columns.find((column) => column.stage === overId)
      if (!target) return
      if (from.stage === overId) return

      onMove(activeId, overId, target.cards.length)
      return
    }

    const to = cardsById.get(overId)
    if (!to) return

    const target = columns.find((column) => column.stage === to.stage)
    if (!target) return

    const index = target.cards.findIndex((card) => card.id === overId)
    if (index < 0) return
    if (from.stage === to.stage && activeId === overId) return

    onMove(activeId, to.stage, index)
  }

  const isCrossColumn =
    overStage !== null && originStage !== null && overStage !== originStage

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <div className="w-full overflow-x-auto pb-4">
        <div className="flex items-start gap-4">
          {columns.map((column) => (
            <Column
              key={column.stage}
              column={column}
              isEmpty={column.cards.length === 0}
              isTarget={overStage === column.stage}
              isOrigin={originStage === column.stage}
              isDragActive={dragging !== null}
            >
              <SortableContext
                items={column.cards.map((card) => card.id)}
                strategy={verticalListSortingStrategy}
              >
                {column.cards.map((card) => (
                  <PipelineCard
                    key={card.id}
                    business={card}
                    onRemove={() => onRemove(card.id)}
                  />
                ))}
              </SortableContext>
            </Column>
          ))}
        </div>
      </div>

      {/*
        Follows the cursor at full opacity while the original stays dimmed.
        Leaving the origin column tilts the card further and turns the ring
        primary, so a cross-column move feels different from a reorder.
      */}
      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {dragging ? (
          <div
            className={cn(
              "bg-card w-72 rounded-lg border p-3 ring-1",
              "transition-[transform,box-shadow,border-color] duration-200 ease-out",
              isCrossColumn
                ? "border-primary/50 ring-primary/40 scale-105 rotate-3 shadow-xl"
                : "ring-primary/20 scale-[1.03] rotate-2 shadow-lg"
            )}
          >
            <PipelineCardContent business={dragging} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
