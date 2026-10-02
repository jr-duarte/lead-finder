"use client"

import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"
import { Plus, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BusinessBulkActions } from "@/components/businesses/business-bulk-actions"
import { AddToCampaignDialog } from "@/components/campaigns/add-to-campaign-dialog"
import { BusinessCreateDialog } from "@/components/businesses/business-create-dialog"
import { BusinessEditDialog } from "@/components/businesses/business-edit-dialog"
import { BusinessTable } from "@/components/businesses/business-table"
import { DataPagination } from "@/components/common/data-pagination"
import { ErrorState } from "@/components/common/error-state"
import { BusinessFilters } from "@/components/filters/business-filters"
import { PageHeader } from "@/components/layout/page-header"
import type { BusinessDTO } from "@/types/api"
import {
  exportBusinessesCsv,
  useBusinesses,
  useDeleteBusinesses,
  useEnrichBusinesses,
  useFilterOptions,
} from "@/viewmodels/use-businesses"
import { useBusinessFilters } from "@/viewmodels/use-business-filters"
import { useAddToPipeline } from "@/viewmodels/use-pipeline"

export function BusinessesView() {
  const {
    filters,
    queryInput,
    setFilters,
    reset,
    activeCount,
    hasActiveFilters,
  } = useBusinessFilters()

  const businessesQuery = useBusinesses(queryInput)
  const optionsQuery = useFilterOptions()
  const enrich = useEnrichBusinesses()
  const remove = useDeleteBusinesses()

  const [selection, setSelection] = React.useState<string[]>([])
  const [editing, setEditing] = React.useState<BusinessDTO | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)
  const [isAddingToCampaign, setIsAddingToCampaign] = React.useState(false)
  const addToPipeline = useAddToPipeline()

  const items = React.useMemo(
    () => businessesQuery.data?.items ?? [],
    [businessesQuery.data]
  )

  // Selections only apply to the rows currently on screen, so stale ids are
  // filtered out during render rather than synced through an effect.
  const visibleIds = React.useMemo(
    () => new Set(items.map((item) => item.id)),
    [items]
  )
  const selectedIds = React.useMemo(
    () => selection.filter((id) => visibleIds.has(id)),
    [selection, visibleIds]
  )

  const toggleRow = (id: string) =>
    setSelection((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    )

  const toggleAll = (checked: boolean) =>
    setSelection(checked ? items.map((item) => item.id) : [])

  const handleSort = (column: string) => {
    const isSame = filters.sortBy === column
    setFilters({
      sortBy: column,
      sortDir: isSame && filters.sortDir === "desc" ? "asc" : "desc",
    })
  }

  const handleBulkEnrich = async () => {
    // Leads without a website cannot be enriched, so they are left out rather
    // than queued only to fail.
    const enrichable = items
      .filter((item) => selectedIds.includes(item.id) && item.website)
      .map((item) => item.id)

    if (enrichable.length === 0) {
      toast.warning("Nenhuma das empresas selecionadas possui website.", {
        description:
          "O enriquecimento lê o site da empresa para extrair contatos.",
      })
      return
    }

    const ignored = selectedIds.length - enrichable.length
    if (ignored > 0) {
      toast.info(
        `${ignored} ${ignored === 1 ? "empresa ignorada" : "empresas ignoradas"} por não ter website.`
      )
    }

    await enrich.mutateAsync({ ids: enrichable })
    setSelection([])
  }

  const handleBulkDelete = async () => {
    await remove.mutateAsync(selectedIds)
    setSelection([])
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresas"
        description="Todas as empresas coletadas, com filtros combináveis."
        actions={
          <>
            <Button variant="outline" onClick={() => setIsCreating(true)}>
              <Plus className="size-4" />
              Nova empresa
            </Button>
            <Button asChild>
              <Link href="/searches/new">
                <Search className="size-4" />
                Nova busca
              </Link>
            </Button>
          </>
        }
      />

      <BusinessFilters
        filters={filters}
        options={optionsQuery.data}
        activeCount={activeCount}
        onChange={setFilters}
        onReset={reset}
        onExport={() => exportBusinessesCsv(queryInput)}
        isExportDisabled={(businessesQuery.data?.total ?? 0) === 0}
      />

      <BusinessBulkActions
        count={selectedIds.length}
        onClear={() => setSelection([])}
        onEnrich={handleBulkEnrich}
        onAddToPipeline={async () => {
          await addToPipeline.mutateAsync({ ids: selectedIds })
          setSelection([])
        }}
        onAddToCampaign={() => setIsAddingToCampaign(true)}
        onExport={() => exportBusinessesCsv(queryInput)}
        onDelete={handleBulkDelete}
        isEnriching={enrich.isPending}
        isDeleting={remove.isPending}
      />

      {businessesQuery.isError ? (
        <ErrorState
          error={businessesQuery.error}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => businessesQuery.refetch()}
            >
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <>
          <BusinessTable
            businesses={items}
            isLoading={businessesQuery.isPending}
            selectedIds={selectedIds}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            sortBy={filters.sortBy}
            sortDir={filters.sortDir}
            onSort={handleSort}
            onEnrich={(id) => enrich.mutate({ ids: [id] })}
            onAddToPipeline={(id) => addToPipeline.mutate({ ids: [id] })}
            onEdit={setEditing}
            hasActiveFilters={hasActiveFilters}
            emptyAction={
              <Button asChild size="sm">
                <Link href="/searches/new">
                  <Plus className="size-4" />
                  Nova busca
                </Link>
              </Button>
            }
          />

          {businessesQuery.data && businessesQuery.data.total > 0 ? (
            <DataPagination
              page={businessesQuery.data.page}
              pageSize={businessesQuery.data.pageSize}
              total={businessesQuery.data.total}
              totalPages={businessesQuery.data.totalPages}
              onPageChange={(page) => setFilters({ page })}
              onPageSizeChange={(pageSize) => setFilters({ pageSize })}
            />
          ) : null}
        </>
      )}

      <BusinessCreateDialog open={isCreating} onOpenChange={setIsCreating} />

      <AddToCampaignDialog
        open={isAddingToCampaign}
        onOpenChange={setIsAddingToCampaign}
        businessIds={selectedIds}
        onDone={() => setSelection([])}
      />

      <BusinessEditDialog
        business={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      />
    </div>
  )
}
