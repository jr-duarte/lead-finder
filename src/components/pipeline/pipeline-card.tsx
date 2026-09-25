"use client"

import Link from "next/link"
import {
  AtSign,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Phone,
  Star,
  Trash2,
} from "lucide-react"

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

/** A lead card on the prospecting board. */
export function PipelineCard({
  business,
  onRemove,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  business: BusinessDTO
  onRemove: () => void
  onDragStart: () => void
  onDragEnd: () => void
  isDragging?: boolean
}) {
  const instagram = business.enrichment?.socials?.instagram

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-card group cursor-grab rounded-lg border p-3 shadow-xs transition-opacity active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0" />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/businesses/${business.id}`}
              className="line-clamp-2 text-sm font-medium hover:underline"
            >
              {business.name}
            </Link>

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
    </div>
  )
}
