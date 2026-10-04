"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import type { FollowUpStatus } from "@/domain/follow-up"
import { apiFetch } from "@/lib/api-client"
import type {
  AutoReplyReviewItemDTO,
  FollowUpDTO,
  FollowUpListDTO,
} from "@/types/api"
import { businessKeys } from "@/viewmodels/use-businesses"
import { pipelineKeys } from "@/viewmodels/use-pipeline"

export const followUpKeys = {
  all: ["follow-ups"] as const,
  list: () => [...followUpKeys.all, "list"] as const,
  autoReplies: () => [...followUpKeys.all, "auto-replies"] as const,
}

/** Statuses where something happens on its own, worth polling. */
const ACTIVE: FollowUpStatus[] = [
  "PENDING",
  "GENERATING",
  "APPROVED",
  "SENDING",
]

export function useFollowUps() {
  return useQuery({
    queryKey: followUpKeys.list(),
    queryFn: () => apiFetch<FollowUpListDTO>("/api/follow-ups"),
    // Generation and sending run on the server; the page follows by polling.
    refetchInterval: (query) =>
      ACTIVE.some((status) => (query.state.data?.counts[status] ?? 0) > 0)
        ? 4000
        : 30_000,
  })
}

export function useAutoReplyReview() {
  return useQuery({
    queryKey: followUpKeys.autoReplies(),
    queryFn: () =>
      apiFetch<{ items: AutoReplyReviewItemDTO[] }>(
        "/api/follow-ups/auto-replies"
      ),
    refetchInterval: 30_000,
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return (alsoLeads = false) => {
    void queryClient.invalidateQueries({ queryKey: followUpKeys.all })
    if (alsoLeads) {
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      void queryClient.invalidateQueries({ queryKey: businessKeys.all })
    }
  }
}

function onError(title: string) {
  return (error: Error) => toast.error(title, { description: error.message })
}

export function useUpdateFollowUp() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string
      message?: string
      status?: "APPROVED" | "SKIPPED"
    }) =>
      apiFetch<FollowUpDTO>(`/api/follow-ups/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => invalidate(),
    onError: onError("Não foi possível atualizar o follow-up"),
  })
}

export function useRegenerateFollowUp() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<FollowUpDTO>(`/api/follow-ups/${id}/regenerate`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Nova mensagem escrita. Revise antes de aprovar.")
      invalidate()
    },
    onError: (error: Error) => {
      toast.error("Não foi possível regenerar", { description: error.message })
      invalidate()
    },
  })
}

export function useRestoreFollowUp() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<FollowUpDTO>(`/api/follow-ups/${id}/restore`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Follow-up de volta. Revise e aprove.")
      invalidate()
    },
    onError: onError("Não foi possível desfazer"),
  })
}

export function useApproveAllFollowUps() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ approved: number }>("/api/follow-ups/approve-all", {
        method: "POST",
      }),
    onSuccess: ({ approved }) => {
      toast.success(
        approved === 1
          ? "1 follow-up na fila de envio."
          : `${approved} follow-ups na fila de envio.`
      )
      invalidate()
    },
    onError: onError("Não foi possível aprovar"),
  })
}

export function useScanFollowUps() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ created: number }>("/api/follow-ups/scan", { method: "POST" }),
    onSuccess: ({ created }) => {
      toast.success(
        created === 0
          ? "Nenhum lead novo precisa de follow-up agora."
          : created === 1
            ? "1 lead entrou na fila. A mensagem está sendo escrita."
            : `${created} leads entraram na fila. As mensagens estão sendo escritas.`
      )
      invalidate()
    },
    onError: onError("Não foi possível procurar"),
  })
}

/** "Mover para Perdido", for one lead or many. */
export function useMarkFollowUpsLost() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ moved: number }>("/api/follow-ups/lost", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: ({ moved }) => {
      toast.success(
        moved === 1
          ? "1 lead movido para Perdido."
          : `${moved} leads movidos para Perdido.`
      )
      invalidate(true)
    },
    onError: onError("Não foi possível mover"),
  })
}

export function useKeepFollowUp() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<FollowUpDTO>(`/api/follow-ups/${id}/keep`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Lead mantido em Contatado.")
      invalidate()
    },
    onError: onError("Não foi possível manter"),
  })
}

export function useResolveAutoReply() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: {
      businessId: string
      action: "contacted" | "human"
    }) =>
      apiFetch<{ ok: true }>("/api/follow-ups/auto-replies", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_result, { action }) => {
      toast.success(
        action === "contacted"
          ? "Lead de volta em Contatado. O follow-up entra na fila quando for a hora."
          : "Marcado como resposta real. O lead fica em Respondeu."
      )
      invalidate(true)
    },
    onError: onError("Não foi possível concluir"),
  })
}

export function useAnalyzeAutoReplies() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/api/follow-ups/auto-replies/analyze", {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success(
        "Analisando as respostas. Os leads aparecem aqui conforme forem classificados."
      )
      setTimeout(() => invalidate(), 5000)
    },
    onError: onError("Não foi possível analisar"),
  })
}
