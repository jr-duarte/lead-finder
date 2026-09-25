"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { isTerminal } from "@/domain/search"
import { apiFetch } from "@/lib/api-client"
import type { SearchFormData } from "@/schemas/search"
import type { PaginatedDTO, SearchDTO } from "@/types/api"
import { businessKeys } from "@/viewmodels/use-businesses"

export const searchKeys = {
  all: ["searches"] as const,
  list: (page: number) => [...searchKeys.all, "list", page] as const,
  detail: (id: string) => [...searchKeys.all, "detail", id] as const,
}

export function useSearches(page = 1) {
  return useQuery({
    queryKey: searchKeys.list(page),
    queryFn: () =>
      apiFetch<PaginatedDTO<SearchDTO>>(`/api/searches?page=${page}`),
  })
}

/**
 * Polls while the search is running so the progress bar advances, then stops
 * once it reaches a terminal status.
 */
export function useSearch(id: string) {
  return useQuery({
    queryKey: searchKeys.detail(id),
    queryFn: () => apiFetch<SearchDTO>(`/api/searches/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && isTerminal(status) ? false : 1500
    },
  })
}

export function useCreateSearch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SearchFormData) =>
      apiFetch<SearchDTO>("/api/searches", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (search) => {
      toast.success(`Busca #${search.code} iniciada.`)
      void queryClient.invalidateQueries({ queryKey: searchKeys.all })
      void queryClient.invalidateQueries({ queryKey: businessKeys.all })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível iniciar a busca", {
        description: error.message,
      })
    },
  })
}

export function useCancelSearch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<SearchDTO>(`/api/searches/${id}/cancel`, { method: "POST" }),
    onSuccess: (search) => {
      toast.info(`Busca #${search.code} cancelada.`)
      void queryClient.invalidateQueries({ queryKey: searchKeys.all })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível cancelar", { description: error.message })
    },
  })
}
