"use client"

import Link from "next/link"
import * as React from "react"
import { Globe, Play, Sparkles, Building2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ErrorState } from "@/components/common/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { formatNumber } from "@/lib/format"
import { EnrichmentProgress } from "@/components/enrichment/enrichment-progress"
import {
  useCancelEnrichmentJob,
  useEnrichmentJobs,
  useEnrichmentStats,
  useResumeEnrichmentJob,
  useStartEnrichmentJob,
} from "@/viewmodels/use-enrichment"

const BATCH_SIZES = [10, 25, 50, 100]

export function EnrichmentView() {
  const [limit, setLimit] = React.useState(25)
  const [renderJavaScript, setRenderJavaScript] = React.useState(true)
  const stats = useEnrichmentStats()
  const jobs = useEnrichmentJobs()
  const start = useStartEnrichmentJob()
  const cancel = useCancelEnrichmentJob()
  const resume = useResumeEnrichmentJob()

  // The active job wins; otherwise the latest finished one stays on screen.
  const job = jobs.data?.active ?? jobs.data?.recent?.[0] ?? null
  const isRunning = Boolean(jobs.data?.active)

  const data = stats.data

  // Only businesses with a website can be enriched, so they are the
  // denominator: counting the rest would leave the bar permanently short.
  const enrichable = data?.withWebsite ?? 0
  const withoutWebsite = (data?.total ?? 0) - enrichable
  // Coverage tracks how much of the enrichable base has been processed,
  // whether or not each site yielded data.
  const coverage =
    enrichable > 0 ? ((data?.attempted ?? 0) / enrichable) * 100 : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enriquecimento"
        description="Processa os websites coletados em busca de e-mails, redes sociais e tecnologias."
      />

      {stats.isError ? (
        <ErrorState
          error={stats.error}
          action={
            <Button variant="outline" size="sm" onClick={() => stats.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Total de empresas"
              value={data?.total ?? 0}
              icon={Building2}
              isLoading={stats.isPending}
            />
            <KpiCard
              label="Com website"
              value={data?.withWebsite ?? 0}
              icon={Globe}
              isLoading={stats.isPending}
            />
            <KpiCard
              label="Enriquecidas"
              value={data?.enriched ?? 0}
              icon={Sparkles}
              hint="Empresas cujo site retornou algum dado de contato."
              isLoading={stats.isPending}
            />
            <KpiCard
              label="Pendentes"
              value={data?.pending ?? 0}
              icon={Play}
              hint="Empresas com website que ainda não foram processadas."
              isLoading={stats.isPending}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cobertura</CardTitle>
              <CardDescription>
                Percentual das empresas com website já processadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatNumber(data?.attempted ?? 0)} de{" "}
                  {formatNumber(enrichable)} empresas com website
                </span>
                <span className="tabular font-medium">
                  {coverage.toFixed(0)}%
                </span>
              </div>
              <Progress value={coverage} />
              <div className="text-muted-foreground space-y-1 pt-1 text-xs">
                <p>
                  {formatNumber(data?.enriched ?? 0)} com dados extraídos •{" "}
                  {formatNumber(data?.failed ?? 0)} sem retorno (site fora do
                  ar, bloqueado ou sem contatos publicados).
                </p>
                {withoutWebsite > 0 ? (
                  <p>
                    {formatNumber(withoutWebsite)} empresas sem website não
                    podem ser enriquecidas — não há site de onde extrair dados.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {job ? (
            <EnrichmentProgress
              job={job}
              onCancel={() => cancel.mutate(job.id)}
              onResume={() => resume.mutate(job.id)}
              isCancelling={cancel.isPending}
              isResuming={resume.isPending}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Executar em lote</CardTitle>
              <CardDescription>
                Processa as empresas pendentes que possuem website.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert>
                <Sparkles className="size-4" />
                <AlertTitle>Como funciona</AlertTitle>
                <AlertDescription>
                  Cada site é acessado uma única vez para extrair e-mails,
                  perfis sociais e tecnologias. Empresas sem website são
                  ignoradas pelo lote.
                </AlertDescription>
              </Alert>

              <Separator />

              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="render-js">Renderizar JavaScript</Label>
                  <p className="text-muted-foreground text-sm">
                    O navegador só é acionado quando a página chega vazia ao
                    leitor comum, como em sites React/Vue e perfis de redes
                    sociais. Sites tradicionais seguem pelo caminho rápido.
                  </p>
                </div>
                <Switch
                  id="render-js"
                  checked={renderJavaScript}
                  onCheckedChange={setRenderJavaScript}
                />
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">
                    Tamanho do lote
                  </Label>
                  <Select
                    value={String(limit)}
                    onValueChange={(value) => setLimit(Number(value))}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BATCH_SIZES.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} empresas
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={() => start.mutate({ limit, renderJavaScript })}
                  disabled={
                    start.isPending || isRunning || (data?.pending ?? 0) === 0
                  }
                >
                  <Play className="size-4" />
                  {isRunning ? "Em execução..." : "Executar enriquecimento"}
                </Button>

                <Button variant="outline" asChild>
                  <Link href="/businesses?website=yes&status=NEW">
                    Ver pendentes
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
