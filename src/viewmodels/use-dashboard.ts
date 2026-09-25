"use client"

import { useQuery } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { DashboardDTO } from "@/types/api"

export const dashboardKeys = {
  all: ["dashboard"] as const,
}

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: () => apiFetch<DashboardDTO>("/api/dashboard"),
  })
}
