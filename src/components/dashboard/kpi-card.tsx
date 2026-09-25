import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatNumber } from "@/lib/format"

/** Compact KPI tile: label, value, and an optional share of the total. */
export function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  share,
  isLoading,
}: {
  label: string
  /** A number is formatted with pt-BR separators; a string is shown as-is. */
  value: number | string
  icon: LucideIcon
  hint?: string
  share?: number
  isLoading?: boolean
}) {
  const content = (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground truncate text-xs font-medium">
            {label}
          </p>
          {isLoading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="tabular text-2xl font-semibold tracking-tight">
              {typeof value === "number" ? formatNumber(value) : value}
            </p>
          )}
          {share !== undefined && !isLoading ? (
            <p className="text-muted-foreground tabular text-xs">
              {share.toFixed(0)}% do total
            </p>
          ) : null}
        </div>
        <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  )

  if (!hint) return content

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}
