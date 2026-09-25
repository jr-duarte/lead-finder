"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { PIPELINE_STAGE_LABELS, type PipelineStage } from "@/domain/pipeline"
import { apiFetch } from "@/lib/api-client"
import type { BoardDTO, BusinessDTO } from "@/types/api"
import { businessKeys } from "@/viewmodels/use-businesses"

export const pipelineKeys = {
  all: ["pipeline"] as const,
  board: () => [...pipelineKeys.all, "board"] as const,
}

export function usePipelineBoard() {
  return useQuery({
    queryKey: pipelineKeys.board(),
    queryFn: () => apiFetch<BoardDTO>("/api/pipeline"),
  })
}

export function useAddToPipeline() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { ids: string[]; stage?: PipelineStage }) =>
      apiFetch<{ added: number; skipped: number }>("/api/pipeline", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: ({ added, skipped }) => {
      if (added === 0) {
        toast.info("Nenhuma empresa nova adicionada.", {
          description: "As selecionadas já estão no funil.",
        })
      } else {
        toast.success(
          added === 1
            ? "1 empresa adicionada ao funil."
            : `${added} empresas adicionadas ao funil.`,
          skipped > 0
            ? { description: `${skipped} já estavam no funil.` }
            : undefined
        )
      }

      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      void queryClient.invalidateQueries({ queryKey: businessKeys.all })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível adicionar", { description: error.message })
    },
  })
}

/**
 * Moves a card. The board is updated optimistically so dragging feels
 * immediate, and rolled back if the request fails.
 */
export function useMoveCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      stage,
      position,
    }: {
      id: string
      stage: PipelineStage
      position?: number
    }) =>
      apiFetch<BusinessDTO>(`/api/pipeline/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ stage, position }),
      }),

    onMutate: async ({ id, stage, position }) => {
      await queryClient.cancelQueries({ queryKey: pipelineKeys.board() })
      const previous = queryClient.getQueryData<BoardDTO>(pipelineKeys.board())

      queryClient.setQueryData<BoardDTO>(pipelineKeys.board(), (current) => {
        if (!current) return current

        let moved: BusinessDTO | undefined
        const stripped = current.columns.map((column) => {
          const found = column.cards.find((card) => card.id === id)
          if (found) moved = found
          return {
            ...column,
            cards: column.cards.filter((card) => card.id !== id),
          }
        })

        if (!moved) return current
        const card = moved

        return {
          columns: stripped.map((column) => {
            if (column.stage !== stage) return column

            const cards = [...column.cards]
            cards.splice(position ?? cards.length, 0, card)
            return { ...column, cards }
          }),
        }
      })

      return { previous }
    },

    onError: (error: Error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(pipelineKeys.board(), context.previous)
      }
      toast.error("Não foi possível mover", { description: error.message })
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.board() })
    },
  })
}

export function useRemoveFromPipeline() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ removed: number }>("/api/pipeline", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: ({ removed }) => {
      toast.success(
        removed === 1
          ? "Empresa removida do funil."
          : `${removed} empresas removidas do funil.`,
        { description: "Os dados da empresa foram mantidos." }
      )
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      void queryClient.invalidateQueries({ queryKey: businessKeys.all })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível remover", { description: error.message })
    },
  })
}

export function useCreateBusiness() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: unknown) =>
      apiFetch<BusinessDTO>("/api/businesses", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (business) => {
      toast.success("Empresa cadastrada.", { description: business.name })
      void queryClient.invalidateQueries({ queryKey: businessKeys.all })
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível cadastrar", { description: error.message })
    },
  })
}

/**
 * Changes a lead's stage from the detail page. Unlike useMoveCard, it does not
 * touch the board cache optimistically — the board is not mounted here — and
 * refreshes the lead itself instead.
 */
export function useChangeStage(businessId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (stage: PipelineStage) =>
      apiFetch<BusinessDTO>(`/api/pipeline/${businessId}`, {
        method: "PATCH",
        body: JSON.stringify({ stage }),
      }),
    onSuccess: (business) => {
      const stage = business.pipeline?.stage
      toast.success(
        stage
          ? `Movida para ${PIPELINE_STAGE_LABELS[stage]}.`
          : "Etapa atualizada."
      )

      void queryClient.invalidateQueries({
        queryKey: businessKeys.detail(businessId),
      })
      void queryClient.invalidateQueries({ queryKey: businessKeys.all })
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível mover", { description: error.message })
    },
  })
}
