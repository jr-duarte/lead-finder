"use client"

import {
  Ban,
  CheckCircle2,
  CircleAlert,
  Loader2,
  RotateCcw,
} from "lucide-react"

import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  ENRICHMENT_JOB_STATUS_LABELS,
  isJobTerminal,
  type EnrichmentJobStatus,
} from "@/domain/enrichment-job"
import { formatNumber } from "@/lib/format"
import type { EnrichmentJobDTO } from "@/types/api"

const VARIANTS: Record<
  EnrichmentJobStatus,
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

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("tabular text-xl font-semibold", className)}>
        {formatNumber(value)}
      </p>
    </div>
  )
}

/** Live progress for a background enrichment run. */
export function EnrichmentProgress({
  job,
  onCancel,
  onResume,
  isCancelling,
  isResuming,
}: {
  job: EnrichmentJobDTO
  onCancel?: () => void
  onResume?: () => void
  isCancelling?: boolean
  isResuming?: boolean
}) {
  const terminal = isJobTerminal(job.status)
  const running = job.status === "RUNNING" || job.status === "PENDING"
  const config = VARIANTS[job.status] ?? VARIANTS.PENDING

  const StatusIcon =
    job.status === "COMPLETED"
      ? CheckCircle2
      : job.status === "FAILED"
        ? CircleAlert
        : job.status === "CANCELLED"
          ? Ban
          : Loader2

  const canResume =
    terminal && job.status !== "COMPLETED" && job.pendingIds.length > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <StatusIcon
                className={`size-4 ${running ? "animate-spin" : ""}`}
              />
              Execução em andamento
            </CardTitle>
            <CardDescription>
              {running
                ? "Rodando no servidor — você pode sair desta página."
                : "Resultado da última execução."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {job.renderJavaScript ? (
              <Badge variant="secondary">JavaScript</Badge>
            ) : null}
            <Badge variant={config.variant} className={config.className}>
              {ENRICHMENT_JOB_STATUS_LABELS[job.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground tabular">
              {formatNumber(job.stats.processed)} de{" "}
              {formatNumber(job.stats.total)}
            </span>
            <span className="tabular font-medium">{job.progress}%</span>
          </div>
          <Progress value={job.progress} />
        </div>

        <Separator />

        <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
          <Stat label="Processadas" value={job.stats.processed} />
          <Stat
            label="Com sucesso"
            value={job.stats.succeeded}
            className={job.stats.succeeded > 0 ? "text-success" : undefined}
          />
          <Stat
            label="Com falha"
            value={job.stats.failed}
            className={job.stats.failed > 0 ? "text-destructive" : undefined}
          />
          {job.stats.skipped > 0 ? (
            <Stat label="Sem website" value={job.stats.skipped} />
          ) : null}
        </div>

        {job.stats.failed > 0 ? (
          <p className="text-muted-foreground text-xs">
            Falhas ocorrem quando o site está fora do ar, bloqueia acesso
            automatizado ou não publica contatos. Abra a empresa para ver o
            motivo de cada uma.
          </p>
        ) : null}

        {job.error ? (
          <p className="text-destructive text-sm">{job.error}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!terminal && onCancel ? (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isCancelling}
            >
              <Ban className="size-4" />
              {isCancelling ? "Cancelando..." : "Cancelar"}
            </Button>
          ) : null}

          {canResume && onResume ? (
            <Button variant="outline" onClick={onResume} disabled={isResuming}>
              <RotateCcw className="size-4" />
              {isResuming
                ? "Retomando..."
                : `Retomar ${formatNumber(job.pendingIds.length)} restantes`}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
