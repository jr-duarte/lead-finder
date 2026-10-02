import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { WHATSAPP_STATUS_LABELS, type WhatsAppStatus } from "@/domain/whatsapp"

const DOT_STYLES: Record<WhatsAppStatus, string> = {
  DISCONNECTED: "bg-muted-foreground",
  INITIALIZING: "bg-warning animate-pulse",
  QR_REQUIRED: "bg-warning",
  CONNECTED: "bg-success",
  SYNCING: "bg-warning animate-pulse",
  READY: "bg-success",
  RECONNECTING: "bg-warning animate-pulse",
  LOGGED_OUT: "bg-muted-foreground",
  ERROR: "bg-destructive",
}

/** Colored dot plus label: green connected, yellow working, red failed. */
export function WhatsAppStatusBadge({
  status,
  className,
}: {
  status: WhatsAppStatus
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <span
        className={cn("size-2 rounded-full", DOT_STYLES[status])}
        aria-hidden
      />
      {WHATSAPP_STATUS_LABELS[status]}
    </Badge>
  )
}
