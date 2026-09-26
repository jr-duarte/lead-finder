"use client"

import Link from "next/link"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  AtSign,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Phone,
  Star,
  Trash2,
} from "lucide-react"

import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatPhone, formatRating } from "@/lib/format"
import type { BusinessDTO } from "@/types/api"

/** Card contents, shared by the sortable card and the drag overlay. */
export function PipelineCardContent({
  business,
  onRemove,
  dragHandle,
}: {
  business: BusinessDTO
  onRemove?: () => void
  dragHandle?: React.ReactNode
}) {
  const instagram = business.enrichment?.socials?.instagram

  return (
    <div className="flex items-start gap-2">
      {dragHandle ?? (
        <GripVertical className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0" />
      )}

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/businesses/${business.id}`}
            className="line-clamp-2 text-sm font-medium hover:underline"
          >
            {business.name}
          </Link>

          {onRemove ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                  aria-label={`Ações para ${business.name}`}
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/businesses/${business.id}`}>
                    <ExternalLink className="size-4" />
                    Abrir empresa
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onRemove} variant="destructive">
                  <Trash2 className="size-4" />
                  Remover do funil
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {business.category || business.address?.city ? (
          <p className="text-muted-foreground truncate text-xs">
            {[business.category, business.address?.city]
              .filter(Boolean)
              .join(" • ")}
          </p>
        ) : null}

        <div className="text-muted-foreground flex flex-wrap items-center gap-2.5 text-xs">
          {business.rating ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3 fill-current text-amber-500" />
              <span className="tabular">{formatRating(business.rating)}</span>
            </span>
          ) : null}

          {business.phone ? (
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3" />
              <span className="tabular">{formatPhone(business.phone)}</span>
            </span>
          ) : null}

          {instagram ? (
            <span className="inline-flex items-center gap-1">
              <AtSign className="size-3" />
              {instagram}
            </span>
          ) : null}
        </div>

        {!business.website ? (
          <Badge variant="secondary" className="text-[10px]">
            Sem website
          </Badge>
        ) : null}
      </div>
    </div>
  )
}

/**
 * A lead card on the board. The drag listeners live on the grip handle only,
 * so links and the actions menu stay clickable.
 */
export function PipelineCard({
  business,
  onRemove,
}: {
  business: BusinessDTO
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: business.id,
    // Neighbours slide out of the way with the same easing as the drop.
    transition: {
      duration: 220,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        "bg-card group rounded-lg border p-3 shadow-xs",
        // The original shrinks slightly and fades, reading as a gap the card
        // will return to rather than a card that vanished.
        isDragging && "scale-[0.98] opacity-40"
      )}
    >
      <PipelineCardContent
        business={business}
        onRemove={onRemove}
        dragHandle={
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="text-muted-foreground/40 hover:text-muted-foreground mt-0.5 shrink-0 cursor-grab touch-none active:cursor-grabbing"
            aria-label={`Mover ${business.name}`}
          >
            <GripVertical className="size-3.5" />
          </button>
        }
      />
    </div>
  )
}
