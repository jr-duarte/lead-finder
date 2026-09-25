"use client"

import { useQuery } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { SourceInfoDTO } from "@/types/api"

export const sourceKeys = {
  all: ["source"] as const,
}

/** Describes the configured collection source and the limits it honours. */
export function useSourceInfo() {
  return useQuery({
    queryKey: sourceKeys.all,
    queryFn: () => apiFetch<SourceInfoDTO>("/api/source"),
    staleTime: 5 * 60_000,
  })
}
