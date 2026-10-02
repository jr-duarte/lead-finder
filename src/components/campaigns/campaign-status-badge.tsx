import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import {
  CAMPAIGN_ITEM_STATUS_LABELS,
  CAMPAIGN_STATUS_LABELS,
  type CampaignItemStatus,
  type CampaignStatus,
} from "@/domain/campaign"

const CAMPAIGN_STYLES: Record<CampaignStatus, string> = {
  GENERATING: "border-warning/50 text-warning bg-warning/10",
  REVIEW: "border-primary/40 text-primary bg-primary/10",
  RUNNING: "border-success/40 text-success bg-success/10",
  PAUSED: "border-warning/50 text-warning bg-warning/10",
  DONE: "text-muted-foreground",
  CANCELLED: "text-muted-foreground",
}

export function CampaignStatusBadge({
  status,
  className,
}: {
  status: CampaignStatus
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn(CAMPAIGN_STYLES[status], className)}>
      {CAMPAIGN_STATUS_LABELS[status]}
    </Badge>
  )
}

const ITEM_STYLES: Record<CampaignItemStatus, string> = {
  PENDING: "text-muted-foreground",
  GENERATING: "border-warning/50 text-warning bg-warning/10",
  READY: "border-primary/40 text-primary bg-primary/10",
  APPROVED: "border-primary/40 text-primary bg-primary/10",
  SENDING: "border-warning/50 text-warning bg-warning/10",
  SENT: "border-success/40 text-success bg-success/10",
  REPLIED: "border-success/40 text-success bg-success/20 font-semibold",
  SKIPPED: "text-muted-foreground",
  INELIGIBLE: "text-muted-foreground",
  FAILED: "border-destructive/40 text-destructive bg-destructive/10",
}

export function CampaignItemStatusBadge({
  status,
}: {
  status: CampaignItemStatus
}) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap", ITEM_STYLES[status])}
    >
      {CAMPAIGN_ITEM_STATUS_LABELS[status]}
    </Badge>
  )
}
