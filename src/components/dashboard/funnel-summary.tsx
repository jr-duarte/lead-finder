"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { CircleSlash, Timer, Trophy } from "lucide-react"

import { cn } from "cn"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format"
import type { DashboardDTO } from "@/types/api"

/**
 * Headline metric on the board: larger type and a coloured accent, so the
 * funnel reads before the collection counters below it.
 */
function FunnelStat({
  label,
  value,
  hint,
  icon: Icon,
  href,
  accent,
  isLoading,
}: {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  href: string
  accent: string
  isLoading?: boolean
}) {
  return (
    <Link href={href} className="group">
      <Card className="group-hover:border-foreground/20 h-full gap-0 py-0 transition-colors">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md",
                accent
              )}
            >
              <Icon className="size-4" />
            </div>
            <p className="text-sm font-medium">{label}</p>
          </div>

          {isLoading ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <p className="tabular text-4xl font-semibold tracking-tight">
              {formatNumber(value)}
            </p>
          )}

          <p className="text-muted-foreground text-xs">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  )
}

export function FunnelSummary({
  data,
  isLoading,
}: {
  data?: DashboardDTO["funnel"]
  isLoading?: boolean
}) {
  const won = data?.won ?? 0
  const lost = data?.lost ?? 0
  const inProgress = data?.inProgress ?? 0
  const winRate = data?.winRate ?? 0
  const closed = won + lost

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Funil de prospecção</h2>
        <Link
          href="/pipeline"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Abrir funil
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FunnelStat
          label="Ganhos"
          value={won}
          hint={
            closed > 0
              ? `${winRate.toFixed(0)}% das negociações encerradas`
              : "Nenhuma negociação encerrada ainda"
          }
          icon={Trophy}
          href="/businesses?pipelineStage=WON"
          accent="bg-success/10 text-success"
          isLoading={isLoading}
        />

        <FunnelStat
          label="Perdidos"
          value={lost}
          hint={
            closed > 0
              ? `${(100 - winRate).toFixed(0)}% das negociações encerradas`
              : "Nenhuma negociação encerrada ainda"
          }
          icon={CircleSlash}
          href="/businesses?pipelineStage=LOST"
          accent="bg-destructive/10 text-destructive"
          isLoading={isLoading}
        />

        <FunnelStat
          label="Em andamento"
          value={inProgress}
          hint="Novo, contatado, respondeu, reunião e proposta"
          icon={Timer}
          href="/businesses?pipeline=in"
          accent="bg-primary/10 text-primary"
          isLoading={isLoading}
        />
      </div>

      {closed > 0 ? (
        <Card className="gap-0 py-0">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Taxa de conversão</span>
              <span className="tabular font-medium">{winRate.toFixed(0)}%</span>
            </div>
            <Progress value={winRate} />
            <p className="text-muted-foreground tabular text-xs">
              {formatNumber(won)} ganhos de {formatNumber(closed)} encerrados
            </p>
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}
