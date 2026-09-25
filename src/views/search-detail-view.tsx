"use client"

import Link from "next/link"
import { ArrowLeft, Building2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/common/error-state"
import { SearchProgress } from "@/components/searches/search-progress"
import { formatDateTime, formatNumber } from "@/lib/format"
import { useCancelSearch, useSearch } from "@/viewmodels/use-searches"

export function SearchDetailView({ id }: { id: string }) {
  const { data, isPending, isError, error, refetch } = useSearch(id)
  const cancel = useCancelSearch()

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link href="/searches">
        <ArrowLeft className="size-4" />
        Voltar para buscas
      </Link>
    </Button>
  )

  if (isError) {
    return (
      <div className="space-y-6">
        {backLink}
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

  if (isPending || !data) {
    return (
      <div className="space-y-6">
        {backLink}
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {backLink}

      <SearchProgress
        search={data}
        onCancel={() => cancel.mutate(id)}
        isCancelling={cancel.isPending}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parâmetros da busca</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y text-sm">
            {[
              ["Categoria", data.params.category],
              ["Localização", data.params.location],
              [
                "Coordenadas",
                data.params.latitude !== undefined &&
                data.params.longitude !== undefined
                  ? `${data.params.latitude.toFixed(5)}, ${data.params.longitude.toFixed(5)}`
                  : "Definidas pela localização",
              ],
              ["Raio", `${formatNumber(data.params.radiusMeters)} m`],
              ["Quantidade", formatNumber(data.params.limit)],
              ["Fonte", data.source],
              ["Criada em", formatDateTime(data.createdAt)],
              ["Finalizada em", formatDateTime(data.finishedAt)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-4"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular sm:col-span-2">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Button asChild variant="outline">
        <Link href="/businesses">
          <Building2 className="size-4" />
          Ver empresas coletadas
        </Link>
      </Button>
    </div>
  )
}
