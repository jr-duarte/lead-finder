import { BUSINESS_STATUS_LABELS, type BusinessStatus } from "@/domain/business"
import { Badge } from "@/components/ui/badge"

const VARIANTS: Record<
  BusinessStatus,
  {
    variant: "default" | "secondary" | "outline" | "destructive"
    className?: string
  }
> = {
  NEW: { variant: "secondary" },
  ENRICHED: {
    variant: "outline",
    className: "border-success/40 text-success bg-success/10",
  },
  ENRICHMENT_FAILED: {
    variant: "outline",
    className: "border-destructive/40 text-destructive bg-destructive/10",
  },
  ARCHIVED: { variant: "outline", className: "text-muted-foreground" },
}

export function BusinessStatusBadge({ status }: { status: BusinessStatus }) {
  const config = VARIANTS[status] ?? VARIANTS.NEW

  return (
    <Badge variant={config.variant} className={config.className}>
      {BUSINESS_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
