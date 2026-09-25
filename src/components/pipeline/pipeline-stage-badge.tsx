import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { PIPELINE_STAGE_LABELS, type PipelineStage } from "@/domain/pipeline"

const STAGE_STYLES: Record<PipelineStage, string> = {
  NEW: "",
  CONTACTED: "border-primary/40 text-primary bg-primary/10",
  REPLIED: "border-primary/40 text-primary bg-primary/10",
  MEETING: "border-warning/50 text-warning bg-warning/10",
  PROPOSAL: "border-warning/50 text-warning bg-warning/10",
  WON: "border-success/40 text-success bg-success/10",
  LOST: "text-muted-foreground",
}

/** Shows which funnel stage a lead currently occupies. */
export function PipelineStageBadge({
  stage,
  className,
}: {
  stage: PipelineStage
  className?: string
}) {
  return (
    <Badge
      variant={stage === "NEW" ? "secondary" : "outline"}
      className={cn(STAGE_STYLES[stage], className)}
    >
      {PIPELINE_STAGE_LABELS[stage]}
    </Badge>
  )
}
