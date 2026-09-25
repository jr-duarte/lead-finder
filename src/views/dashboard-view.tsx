"use client"

import Link from "next/link"
import {
  AtSign,
  Building2,
  GlobeLock,
  Globe,
  Phone,
  Plus,
  Search,
  Sparkles,
  Star,
} from "lucide-react"

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
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CollectionChart } from "@/components/dashboard/collection-chart"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { SearchStatusBadge } from "@/components/searches/search-status-badge"
import { formatDateTime, formatNumber, formatRating } from "@/lib/format"
import { useDashboard } from "@/viewmodels/use-dashboard"

export function DashboardView() {
  const { data, isPending, isError, error, refetch } = useDashboard()

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <ErrorState
          error={error}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          }
        />
      </div>
    )
  }

  const kpis = data?.kpis
  const total = kpis?.total ?? 0
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Visão geral da base de leads coletados."
        actions={
          <Button asChild>
            <Link href="/searches/new">
              <Plus className="size-4" />
              Nova busca
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total de empresas"
          value={total}
          icon={Building2}
          isLoading={isPending}
        />
        <KpiCard
          label="Sem website"
          value={kpis?.withoutWebsite ?? 0}
          icon={GlobeLock}
          share={share(kpis?.withoutWebsite ?? 0)}
          hint="Empresas sem site são o principal alvo de prospecção."
          isLoading={isPending}
        />
        <KpiCard
          label="Com website"
          value={kpis?.withWebsite ?? 0}
          icon={Globe}
          share={share(kpis?.withWebsite ?? 0)}
          isLoading={isPending}
        />
        <KpiCard
          label="Enriquecidas"
          value={kpis?.enriched ?? 0}
          icon={Sparkles}
          share={share(kpis?.enriched ?? 0)}
          hint="Empresas cujo site já foi processado."
          isLoading={isPending}
        />
        <KpiCard
          label="Com telefone"
          value={kpis?.withPhone ?? 0}
          icon={Phone}
          share={share(kpis?.withPhone ?? 0)}
          isLoading={isPending}
        />
        <KpiCard
          label="Com Instagram"
          value={kpis?.withInstagram ?? 0}
          icon={AtSign}
          share={share(kpis?.withInstagram ?? 0)}
          isLoading={isPending}
        />
        <KpiCard
          label="Total de buscas"
          value={kpis?.totalSearches ?? 0}
          icon={Search}
          isLoading={isPending}
        />
        <KpiCard
          label="Rating médio"
          value={formatRating(data?.avgRating)}
          icon={Star}
          hint="Média das avaliações das empresas com rating."
          isLoading={isPending}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Coleta recente</CardTitle>
            <CardDescription>
              Empresas coletadas nos últimos 14 dias.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <CollectionChart data={data?.timeline ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Categorias</CardTitle>
            <CardDescription>Distribuição por categoria.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPending ? (
              Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))
            ) : (data?.topCategories.length ?? 0) === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nenhuma categoria coletada ainda.
              </p>
            ) : (
              data?.topCategories.map((row) => (
                <div key={row.category} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{row.category}</span>
                    <span className="tabular text-muted-foreground shrink-0">
                      {formatNumber(row.count)}
                    </span>
                  </div>
                  <Progress value={share(row.count)} className="h-1.5" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buscas recentes</CardTitle>
          <CardDescription>
            Últimas coletas executadas no sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="recent">
            <TabsList>
              <TabsTrigger value="recent">Recentes</TabsTrigger>
              <TabsTrigger value="summary">Resumo</TabsTrigger>
            </TabsList>

            <TabsContent value="recent" className="pt-4">
              {isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              ) : (data?.recentSearches.length ?? 0) === 0 ? (
                <EmptyState
                  icon={Search}
                  title="Nenhuma busca realizada"
                  description="Crie sua primeira busca para começar a coletar empresas."
                  action={
                    <Button asChild size="sm">
                      <Link href="/searches/new">
                        <Plus className="size-4" />
                        Nova busca
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Busca</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead className="text-right">Encontradas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criada em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.recentSearches.map((search) => (
                      <TableRow key={search.id}>
                        <TableCell>
                          <Link
                            href={`/searches/${search.id}`}
                            className="font-medium hover:underline"
                          >
                            #{search.code}
                          </Link>
                        </TableCell>
                        <TableCell>{search.params.category}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {search.params.location}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {formatNumber(search.stats.found)}
                        </TableCell>
                        <TableCell>
                          <SearchStatusBadge status={search.status} />
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {formatDateTime(search.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="summary" className="pt-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">
                    Cobertura de contato
                  </p>
                  <p className="tabular text-xl font-semibold">
                    {share(kpis?.withPhone ?? 0).toFixed(0)}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    das empresas possuem telefone
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">
                    Oportunidade (sem site)
                  </p>
                  <p className="tabular text-xl font-semibold">
                    {formatNumber(kpis?.withoutWebsite ?? 0)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    empresas sem presença web
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">
                    Enriquecimento
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="tabular text-xl font-semibold">
                      {share(kpis?.enriched ?? 0).toFixed(0)}%
                    </p>
                    <Badge variant="secondary">
                      {formatNumber(kpis?.enriched ?? 0)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    da base processada
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
