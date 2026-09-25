"use client"

import Link from "next/link"
import { Building2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { PipelineBoard } from "@/components/pipeline/pipeline-board"
import { formatNumber } from "@/lib/format"
import {
  useMoveCard,
  usePipelineBoard,
  useRemoveFromPipeline,
} from "@/viewmodels/use-pipeline"

export function PipelineView() {
  const board = usePipelineBoard()
  const move = useMoveCard()
  const remove = useRemoveFromPipeline()

  const columns = board.data?.columns ?? []
  const total = columns.reduce((sum, column) => sum + column.cards.length, 0)

  if (board.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Funil" />
        <ErrorState
          error={board.error}
          action={
            <Button variant="outline" size="sm" onClick={() => board.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Funil"
        description={
          total > 0
            ? `${formatNumber(total)} ${total === 1 ? "empresa" : "empresas"} em prospecção.`
            : "Acompanhe suas empresas ao longo da prospecção."
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/businesses">
              <Building2 className="size-4" />
              Escolher empresas
            </Link>
          </Button>
        }
      />

      {!board.isPending && total === 0 ? (
        <div className="bg-card rounded-lg border">
          <EmptyState
            icon={Building2}
            title="Nenhuma empresa no funil"
            description="Selecione empresas na listagem e envie para o funil, ou cadastre uma nova manualmente."
            action={
              <Button asChild size="sm">
                <Link href="/businesses">
                  <Plus className="size-4" />
                  Escolher empresas
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <PipelineBoard
          columns={columns}
          isLoading={board.isPending}
          onMove={(id, stage, position) => move.mutate({ id, stage, position })}
          onRemove={(id) => remove.mutate([id])}
        />
      )}
    </div>
  )
}
