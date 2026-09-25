"use client"

import Link from "next/link"
import * as React from "react"
import { Plus, Search as SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DataPagination } from "@/components/common/data-pagination"
import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { SearchStatusBadge } from "@/components/searches/search-status-badge"
import { formatDateTime, formatNumber } from "@/lib/format"
import { useSearches } from "@/viewmodels/use-searches"

export function SearchesView() {
  const [page, setPage] = React.useState(1)
  const { data, isPending, isError, error, refetch } = useSearches(page)

  const newSearchButton = (
    <Button asChild size="sm">
      <Link href="/searches/new">
        <Plus className="size-4" />
        Nova busca
      </Link>
    </Button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buscas"
        description="Histórico de coletas executadas."
        actions={
          <Button asChild>
            <Link href="/searches/new">
              <Plus className="size-4" />
              Nova busca
            </Link>
          </Button>
        }
      />

      {isError ? (
        <ErrorState
          error={error}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <>
          <div className="bg-card overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-20">Busca</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead className="text-right">Encontradas</TableHead>
                    <TableHead className="text-right">Novas</TableHead>
                    <TableHead className="text-right">Atualizadas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criada em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPending ? (
                    Array.from({ length: 6 }).map((_, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {Array.from({ length: 8 }).map((__, cellIndex) => (
                          <TableCell key={cellIndex}>
                            <Skeleton className="h-4 w-full max-w-24" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (data?.items.length ?? 0) === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={8} className="p-0">
                        <EmptyState
                          icon={SearchIcon}
                          title="Nenhuma busca realizada"
                          description="Crie sua primeira busca para começar a coletar empresas."
                          action={newSearchButton}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.items.map((search) => (
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
                        <TableCell className="tabular text-right">
                          {formatNumber(search.stats.created)}
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground text-right">
                          {formatNumber(search.stats.updated)}
                        </TableCell>
                        <TableCell>
                          <SearchStatusBadge status={search.status} />
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {formatDateTime(search.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {data && data.total > 0 ? (
            <DataPagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
