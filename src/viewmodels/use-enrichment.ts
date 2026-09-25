"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { isJobTerminal } from "@/domain/enrichment-job"
import { apiFetch } from "@/lib/api-client"
import type {
  EnrichmentJobDTO,
  EnrichmentJobsDTO,
  EnrichmentStatsDTO,
} from "@/types/api"
import { businessKeys } from "@/viewmodels/use-businesses"

export const enrichmentKeys = {
  all: ["enrichment"] as const,
  stats: () => [...enrichmentKeys.all, "stats"] as const,
  jobs: () => [...enrichmentKeys.all, "jobs"] as const,
  job: (id: string) => [...enrichmentKeys.all, "job", id] as const,
}

export function useEnrichmentStats() {
  return useQuery({
    queryKey: enrichmentKeys.stats(),
    queryFn: () => apiFetch<EnrichmentStatsDTO>("/api/enrichment/stats"),
  })
}

/**
 * Lists jobs and surfaces the active one. Polls while something is running so
 * a reload picks the run back up.
 */
export function useEnrichmentJobs() {
  return useQuery({
    queryKey: enrichmentKeys.jobs(),
    queryFn: () => apiFetch<EnrichmentJobsDTO>("/api/enrichment/jobs"),
    refetchInterval: (query) => (query.state.data?.active ? 2000 : false),
  })
}

/** Polls a single job until it reaches a terminal status. */
export function useEnrichmentJob(id: string | null) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: enrichmentKeys.job(id ?? ""),
    queryFn: async () => {
      const job = await apiFetch<EnrichmentJobDTO>(`/api/enrichment/jobs/${id}`)

      // Enriched rows change the businesses list, so keep it fresh.
      if (isJobTerminal(job.status)) {
        void queryClient.invalidateQueries({ queryKey: businessKeys.all })
        void queryClient.invalidateQueries({
          queryKey: enrichmentKeys.stats(),
        })
      }

      return job
    },
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && isJobTerminal(status) ? false : 1500
    },
  })
}

export function useStartEnrichmentJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (options: {
      limit?: number
      ids?: string[]
      renderJavaScript?: boolean
    }) =>
      apiFetch<EnrichmentJobDTO>("/api/enrichment/jobs", {
        method: "POST",
        body: JSON.stringify(options),
      }),
    onSuccess: (job) => {
      toast.success("Enriquecimento iniciado.", {
        description: `${job.stats.total} empresas na fila. Você pode sair desta página.`,
      })
      void queryClient.invalidateQueries({ queryKey: enrichmentKeys.jobs() })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível iniciar", { description: error.message })
    },
  })
}

export function useCancelEnrichmentJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<EnrichmentJobDTO>(`/api/enrichment/jobs/${id}/cancel`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.info("Enriquecimento cancelado.")
      void queryClient.invalidateQueries({ queryKey: enrichmentKeys.all })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível cancelar", { description: error.message })
    },
  })
}

export function useResumeEnrichmentJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<EnrichmentJobDTO>(`/api/enrichment/jobs/${id}/resume`, {
        method: "POST",
      }),
    onSuccess: (job) => {
      toast.success("Enriquecimento retomado.", {
        description: `${job.stats.total} empresas restantes.`,
      })
      void queryClient.invalidateQueries({ queryKey: enrichmentKeys.all })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível retomar", { description: error.message })
    },
  })
}
