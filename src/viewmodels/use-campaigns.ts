"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import type { CampaignStatus, SendWindow } from "@/domain/campaign"
import { apiFetch } from "@/lib/api-client"
import type {
  AddLeadsResultDTO,
  CampaignCreateResultDTO,
  CampaignDetailDTO,
  CampaignDTO,
  CampaignItemDTO,
} from "@/types/api"

export const campaignKeys = {
  all: ["campaigns"] as const,
  list: () => [...campaignKeys.all, "list"] as const,
  open: () => [...campaignKeys.all, "open"] as const,
  detail: (id: string) => [...campaignKeys.all, "detail", id] as const,
}

/** Statuses where something happens on its own, worth polling. */
const ACTIVE: CampaignStatus[] = ["GENERATING", "RUNNING"]

export function useCampaigns() {
  return useQuery({
    queryKey: campaignKeys.list(),
    queryFn: () => apiFetch<{ campaigns: CampaignDTO[] }>("/api/campaigns"),
    refetchInterval: (query) =>
      query.state.data?.campaigns.some((campaign) =>
        ACTIVE.includes(campaign.status as CampaignStatus)
      )
        ? 5000
        : false,
  })
}

/** Campaigns that still accept leads, for the "add to campaign" picker. */
export function useOpenCampaigns(enabled = true) {
  return useQuery({
    queryKey: campaignKeys.open(),
    queryFn: () =>
      apiFetch<{ campaigns: CampaignDTO[] }>("/api/campaigns?open=1"),
    enabled,
  })
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: () => apiFetch<CampaignDetailDTO>(`/api/campaigns/${id}`),
    // Generation and sending run on the server; the page follows by polling,
    // like enrichment jobs.
    refetchInterval: (query) => {
      const status = query.state.data?.campaign.status as
        CampaignStatus | undefined
      return status && ACTIVE.includes(status) ? 4000 : 15_000
    },
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: campaignKeys.all })
}

function onError(title: string) {
  return (error: Error) => toast.error(title, { description: error.message })
}

/** Summarizes how many leads joined and why the others did not. */
export function describeAddResult(result: AddLeadsResultDTO): string {
  const added =
    result.added === 1
      ? "1 lead adicionado"
      : `${result.added} leads adicionados`
  if (result.rejected.length === 0) return `${added}.`
  return `${added}. ${result.rejected.length} ficaram de fora.`
}

export function useCreateCampaign() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: {
      name: string
      businessIds: string[]
      intervalMinutes?: number
    }) =>
      apiFetch<CampaignCreateResultDTO>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => void invalidate(),
    onError: onError("Não foi possível criar a campanha"),
  })
}

export function useAddLeadsToCampaign() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, businessIds }: { id: string; businessIds: string[] }) =>
      apiFetch<AddLeadsResultDTO>(`/api/campaigns/${id}/leads`, {
        method: "POST",
        body: JSON.stringify({ businessIds }),
      }),
    onSuccess: () => void invalidate(),
    onError: onError("Não foi possível adicionar os leads"),
  })
}

export function useUpdateCampaign(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (patch: {
      name?: string
      intervalMinutes?: number
      window?: SendWindow
      startAt?: string | null
    }) =>
      apiFetch<CampaignDTO>(`/api/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      toast.success("Configuração salva.")
      void invalidate()
    },
    onError: onError("Não foi possível salvar"),
  })
}

/** Approve all, start, pause, cancel and retry: same shape, no body. */
export function useCampaignAction(
  id: string,
  action: "approve-all" | "start" | "pause" | "cancel" | "retry-failed",
  success?: string
) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      apiFetch<unknown>(`/api/campaigns/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      if (success) toast.success(success)
      void invalidate()
    },
    onError: onError("Não foi possível concluir"),
  })
}

export function useUpdateCampaignItem(campaignId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      itemId,
      ...patch
    }: {
      itemId: string
      message?: string
      status?: "APPROVED" | "SKIPPED"
    }) =>
      apiFetch<CampaignItemDTO>(
        `/api/campaigns/${campaignId}/items/${itemId}`,
        { method: "PATCH", body: JSON.stringify(patch) }
      ),
    onSuccess: () => void invalidate(),
    onError: onError("Não foi possível atualizar o lead"),
  })
}

export function useRestoreCampaignItem(campaignId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<CampaignItemDTO>(
        `/api/campaigns/${campaignId}/items/${itemId}/restore`,
        { method: "POST" }
      ),
    onSuccess: () => {
      toast.success("Lead de volta à campanha. Revise e aprove.")
      void invalidate()
    },
    onError: onError("Não foi possível desfazer"),
  })
}

export function useRegenerateCampaignItem(campaignId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<CampaignItemDTO>(
        `/api/campaigns/${campaignId}/items/${itemId}/regenerate`,
        { method: "POST" }
      ),
    onSuccess: () => {
      toast.success("Nova mensagem escrita. Revise antes de aprovar.")
      void invalidate()
    },
    onError: onError("Não foi possível regenerar"),
  })
}
