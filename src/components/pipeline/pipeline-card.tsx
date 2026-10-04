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
  Repeat,
  Star,
  ThumbsDown,
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
import type { FollowUpStatus } from "@/domain/follow-up"
import { formatPhone, formatRating } from "@/lib/format"
import type { BusinessDTO, FollowUpDTO } from "@/types/api"
import { useMarkFollowUpsLost } from "@/viewmodels/use-follow-ups"

/** What the card says about the lead's follow-up while it is in play. */
const FOLLOW_UP_HINTS: Partial<
  Record<FollowUpStatus, { label: string; className: string }>
> = {
  PENDING: {
    label: "Follow-up sendo escrito",
    className: "text-muted-foreground",
  },
  GENERATING: {
    label: "Follow-up sendo escrito",
    className: "text-muted-foreground",
  },
  READY: {
    label: "Follow-up para aprovar",
    className: "border-primary/40 text-primary bg-primary/10",
  },
  FAILED: {
    label: "Follow-up falhou",
    className: "border-destructive/40 text-destructive bg-destructive/10",
  },
  APPROVED: {
    label: "Follow-up na fila",
    className: "border-primary/40 text-primary bg-primary/10",
  },
  SENDING: {
    label: "Follow-up na fila",
    className: "border-primary/40 text-primary bg-primary/10",
  },
  SENT: {
    label: "Follow-up enviado",
    className: "border-success/40 text-success bg-success/10",
  },
  NO_REPLY: {
    label: "Sem resposta ao follow-up",
    className: "border-destructive/40 text-destructive bg-destructive/10",
  },
}

function FollowUpHint({ followUp }: { followUp: FollowUpDTO }) {
  const lost = useMarkFollowUpsLost()
  const hint = FOLLOW_UP_HINTS[followUp.status as FollowUpStatus]
  if (!hint) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href="/follow-ups">
        <Badge
          variant="outline"
          className={cn("gap-1 text-[10px]", hint.className)}
        >
          <Repeat className="size-3" />
          {hint.label}
        </Badge>
      </Link>
      {followUp.status === "NO_REPLY" ? (
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => lost.mutate([followUp.id])}
          disabled={lost.isPending}
        >
          <ThumbsDown className="size-3" />
          Mover para Perdido
        </Button>
      ) : null}
    </div>
  )
}

/** Card contents, shared by the sortable card and the drag overlay. */
export function PipelineCardContent({
  business,
  followUp,
  onRemove,
  dragHandle,
}: {
  business: BusinessDTO
  followUp?: FollowUpDTO
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

        {followUp ? <FollowUpHint followUp={followUp} /> : null}
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
  followUp,
  onRemove,
}: {
  business: BusinessDTO
  followUp?: FollowUpDTO
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
        followUp={followUp}
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
