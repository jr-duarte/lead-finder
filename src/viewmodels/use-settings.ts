"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import type { SellerProfile } from "@/domain/approach"
import { apiFetch } from "@/lib/api-client"
import type { SellerProfileInput } from "@/schemas/settings"

export const settingsKeys = {
  seller: ["settings", "seller"] as const,
}

type SellerResponse = { seller: SellerProfile }

export function useSellerProfile() {
  return useQuery({
    queryKey: settingsKeys.seller,
    queryFn: async () =>
      (await apiFetch<SellerResponse>("/api/settings")).seller,
  })
}

export function useUpdateSellerProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SellerProfileInput) =>
      (
        await apiFetch<SellerResponse>("/api/settings", {
          method: "PUT",
          body: JSON.stringify(input),
        })
      ).seller,
    onSuccess: (seller) => {
      queryClient.setQueryData(settingsKeys.seller, seller)
      toast.success("Configurações salvas.")
    },
    onError: (error: Error) => {
      toast.error("Não foi possível salvar", { description: error.message })
    },
  })
}
