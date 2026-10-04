import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import {
  FOLLOW_UP_STATUS_LABELS,
  type FollowUpStatus,
} from "@/domain/follow-up"

const STYLES: Record<FollowUpStatus, string> = {
  PENDING: "text-muted-foreground",
  GENERATING: "border-warning/50 text-warning bg-warning/10",
  READY: "border-primary/40 text-primary bg-primary/10",
  APPROVED: "border-primary/40 text-primary bg-primary/10",
  SENDING: "border-warning/50 text-warning bg-warning/10",
  SENT: "border-success/40 text-success bg-success/10",
  NO_REPLY: "border-destructive/40 text-destructive bg-destructive/10",
  REPLIED: "border-success/40 text-success bg-success/20 font-semibold",
  LOST: "text-muted-foreground",
  CLOSED: "text-muted-foreground",
  CANCELLED: "text-muted-foreground",
  SKIPPED: "text-muted-foreground",
  FAILED: "border-destructive/40 text-destructive bg-destructive/10",
}

export function FollowUpStatusBadge({
  status,
  className,
}: {
  status: FollowUpStatus
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap", STYLES[status], className)}
    >
      {FOLLOW_UP_STATUS_LABELS[status]}
    </Badge>
  )
}
