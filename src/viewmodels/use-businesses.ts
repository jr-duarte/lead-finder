"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query"
import { toast } from "sonner"

import { apiFetch, toQueryString } from "@/lib/api-client"
import type {
  BusinessFiltersInput,
  BusinessUpdateInput,
} from "@/schemas/business"
import type {
  BusinessDTO,
  EnrichmentJobDTO,
  FilterOptionsDTO,
  PaginatedDTO,
} from "@/types/api"

export const businessKeys = {
  all: ["businesses"] as const,
  list: (filters: BusinessFiltersInput) =>
    [...businessKeys.all, "list", filters] as const,
  detail: (id: string) => [...businessKeys.all, "detail", id] as const,
  options: () => [...businessKeys.all, "options"] as const,
}

export function useBusinesses(filters: BusinessFiltersInput) {
  return useQuery({
    queryKey: businessKeys.list(filters),
    queryFn: () =>
      apiFetch<PaginatedDTO<BusinessDTO>>(
        `/api/businesses?${toQueryString(filters as Record<string, string | number>)}`
      ),
    // Keeps the previous page visible while the next one loads.
    placeholderData: keepPreviousData,
  })
}

export function useBusiness(id: string) {
  return useQuery({
    queryKey: businessKeys.detail(id),
    queryFn: () => apiFetch<BusinessDTO>(`/api/businesses/${id}`),
    enabled: Boolean(id),
  })
}

export function useFilterOptions() {
  return useQuery({
    queryKey: businessKeys.options(),
    queryFn: () => apiFetch<FilterOptionsDTO>("/api/businesses/filters"),
    staleTime: 5 * 60_000,
  })
}

export function useUpdateBusiness(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: BusinessUpdateInput) =>
      apiFetch<BusinessDTO>(`/api/businesses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success("Empresa atualizada com sucesso.")
      void queryClient.invalidateQueries({ queryKey: businessKeys.all })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível salvar", { description: error.message })
    },
  })
}

export function useDeleteBusinesses() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ deleted: number }>("/api/businesses", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: ({ deleted }) => {
      toast.success(
        deleted === 1 ? "1 empresa excluída." : `${deleted} empresas excluídas.`
      )
      void queryClient.invalidateQueries({ queryKey: businessKeys.all })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível excluir", { description: error.message })
    },
  })
}

export function useEnrichBusinesses() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      ids,
      renderJavaScript = true,
    }: {
      ids: string[]
      renderJavaScript?: boolean
    }) =>
      apiFetch<EnrichmentJobDTO>("/api/enrichment/jobs", {
        method: "POST",
        body: JSON.stringify({ ids, renderJavaScript }),
      }),
    onSuccess: (job) => {
      // The run happens in the background, so the toast points to where the
      // progress can be followed rather than reporting a final count.
      toast.success("Enriquecimento iniciado.", {
        description:
          job.stats.total === 1
            ? "Acompanhe o progresso em Enriquecimento."
            : `${job.stats.total} empresas na fila. Acompanhe em Enriquecimento.`,
      })

      void queryClient.invalidateQueries({ queryKey: businessKeys.all })
      void queryClient.invalidateQueries({ queryKey: ["enrichment"] })
    },
    onError: (error: Error) => {
      toast.error("Falha no enriquecimento", { description: error.message })
    },
  })
}

/** Triggers the CSV download for the current filter selection. */
export function exportBusinessesCsv(filters: BusinessFiltersInput): void {
  const query = toQueryString(filters as Record<string, string | number>)

  // A download anchor keeps the SPA mounted; the route responds with
  // Content-Disposition: attachment, so no navigation occurs.
  const link = document.createElement("a")
  link.href = `/api/businesses/export?${query}`
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  link.remove()
}
