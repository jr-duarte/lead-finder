"use client"

import * as React from "react"
import { Download, Sparkles, Trash2, X } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

/** Action bar shown while rows are selected. */
export function BusinessBulkActions({
  count,
  onClear,
  onEnrich,
  onExport,
  onDelete,
  isEnriching,
  isDeleting,
}: {
  count: number
  onClear: () => void
  onEnrich: () => void
  onExport: () => void
  onDelete: () => void
  isEnriching?: boolean
  isDeleting?: boolean
}) {
  if (count === 0) return null

  return (
    <div className="bg-accent/60 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5">
      <span className="text-sm font-medium">
        {count === 1
          ? "1 empresa selecionada"
          : `${count} empresas selecionadas`}
      </span>

      <Separator orientation="vertical" className="h-5" />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onEnrich} disabled={isEnriching}>
          <Sparkles className="size-4" />
          {isEnriching ? "Enriquecendo..." : "Enriquecer"}
        </Button>

        <Button size="sm" variant="outline" onClick={onExport}>
          <Download className="size-4" />
          Exportar
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={isDeleting}>
              <Trash2 className="size-4" />
              Excluir
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Excluir {count === 1 ? "esta empresa" : `${count} empresas`}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Os dados coletados e o
                enriquecimento serão removidos permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Button size="sm" variant="ghost" onClick={onClear} className="ml-auto">
        <X className="size-4" />
        Limpar seleção
      </Button>
    </div>
  )
}
