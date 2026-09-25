import { SEARCH_STATUS_LABELS, type SearchStatus } from "@/domain/search"
import { Badge } from "@/components/ui/badge"

const VARIANTS: Record<
  SearchStatus,
  {
    variant: "default" | "secondary" | "outline" | "destructive"
    className?: string
  }
> = {
  PENDING: { variant: "secondary" },
  RUNNING: {
    variant: "outline",
    className: "border-primary/40 text-primary bg-primary/10",
  },
  COMPLETED: {
    variant: "outline",
    className: "border-success/40 text-success bg-success/10",
  },
  FAILED: { variant: "destructive" },
  CANCELLED: { variant: "outline", className: "text-muted-foreground" },
}

export function SearchStatusBadge({ status }: { status: SearchStatus }) {
  const config = VARIANTS[status] ?? VARIANTS.PENDING

  return (
    <Badge variant={config.variant} className={config.className}>
      {SEARCH_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
