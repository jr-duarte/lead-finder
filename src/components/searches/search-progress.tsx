"use client"

import { Ban, CheckCircle2, CircleAlert, Loader2 } from "lucide-react"

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
import { SearchStatusBadge } from "@/components/searches/search-status-badge"
import { isTerminal } from "@/domain/search"
import { formatNumber } from "@/lib/format"
import type { SearchDTO } from "@/types/api"

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">{formatNumber(value)}</span>
    </div>
  )
}

/** Live progress panel for a running (or finished) search. */
export function SearchProgress({
  search,
  onCancel,
  isCancelling,
}: {
  search: SearchDTO
  onCancel?: () => void
  isCancelling?: boolean
}) {
  const terminal = isTerminal(search.status)
  const running = search.status === "RUNNING" || search.status === "PENDING"

  const StatusIcon =
    search.status === "COMPLETED"
      ? CheckCircle2
      : search.status === "FAILED"
        ? CircleAlert
        : search.status === "CANCELLED"
          ? Ban
          : Loader2

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <StatusIcon
                className={`size-4 ${running ? "animate-spin" : ""}`}
              />
              Busca #{search.code}
            </CardTitle>
            <CardDescription>
              {search.params.category} • {search.params.location}
            </CardDescription>
          </div>
          <SearchStatusBadge status={search.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progresso</span>
            <span className="tabular font-medium">{search.progress}%</span>
          </div>
          <Progress value={search.progress} />
        </div>

        <Separator />

        <div className="grid gap-2 sm:grid-cols-2">
          <StatLine label="Encontradas" value={search.stats.found} />
          <StatLine label="Novas" value={search.stats.created} />
          <StatLine label="Atualizadas" value={search.stats.updated} />
          <StatLine label="Duplicadas" value={search.stats.duplicated} />
        </div>

        {search.error ? (
          <p className="text-destructive text-sm">{search.error}</p>
        ) : null}

        {!terminal && onCancel ? (
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isCancelling}
            className="w-full sm:w-auto"
          >
            <Ban className="size-4" />
            {isCancelling ? "Cancelando..." : "Cancelar busca"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
