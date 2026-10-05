"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import * as React from "react"

import type { BusinessFiltersInput } from "@/schemas/business"

export type FiltersState = {
  search: string
  category: string
  country: string
  city: string
  state: string
  minRating: string
  minReviews: string
  website: string
  phone: string
  instagram: string
  whatsapp: string
  collectedFrom: string
  collectedTo: string
  collectedFromTime: string
  collectedToTime: string
  hideClosed: string
  pipeline: string
  pipelineStage: string
  sortBy: string
  sortDir: string
  page: number
  pageSize: number
}

export const DEFAULT_FILTERS: FiltersState = {
  search: "",
  category: "",
  country: "",
  city: "",
  state: "",
  minRating: "",
  minReviews: "",
  website: "any",
  phone: "any",
  instagram: "any",
  whatsapp: "any",
  collectedFrom: "",
  collectedTo: "",
  collectedFromTime: "",
  collectedToTime: "",
  hideClosed: "true",
  pipeline: "any",
  pipelineStage: "",
  sortBy: "collectedAt",
  sortDir: "desc",
  page: 1,
  pageSize: 25,
}

/** Fields that are not part of "user has narrowed the list" detection. */
const NON_FILTER_KEYS = new Set(["sortBy", "sortDir", "page", "pageSize"])

/**
 * Filter state lives in the URL, so a filtered view is shareable and survives
 * a refresh. Text input is debounced before it reaches the URL.
 */
export function useBusinessFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filters = React.useMemo<FiltersState>(() => {
    const read = (key: keyof FiltersState) =>
      searchParams.get(key) ?? String(DEFAULT_FILTERS[key])

    return {
      search: read("search"),
      category: read("category"),
      country: read("country"),
      city: read("city"),
      state: read("state"),
      minRating: read("minRating"),
      minReviews: read("minReviews"),
      website: read("website"),
      phone: read("phone"),
      instagram: read("instagram"),
      whatsapp: read("whatsapp"),
      collectedFrom: read("collectedFrom"),
      collectedTo: read("collectedTo"),
      collectedFromTime: read("collectedFromTime"),
      collectedToTime: read("collectedToTime"),
      hideClosed: read("hideClosed"),
      pipeline: read("pipeline"),
      pipelineStage: read("pipelineStage"),
      sortBy: read("sortBy"),
      sortDir: read("sortDir"),
      page: Number(searchParams.get("page") ?? 1),
      pageSize: Number(searchParams.get("pageSize") ?? 25),
    }
  }, [searchParams])

  const push = React.useCallback(
    (next: FiltersState) => {
      const params = new URLSearchParams()

      for (const [key, value] of Object.entries(next)) {
        const fallback = DEFAULT_FILTERS[key as keyof FiltersState]
        if (value === "" || value === undefined || value === null) continue
        if (String(value) === String(fallback)) continue
        params.set(key, String(value))
      }

      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router]
  )

  /** Any filter change resets pagination, except page changes themselves. */
  const setFilter = React.useCallback(
    <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
      push({
        ...filters,
        [key]: value,
        ...(key === "page" ? {} : { page: 1 }),
      })
    },
    [filters, push]
  )

  const setFilters = React.useCallback(
    (patch: Partial<FiltersState>) => {
      push({ ...filters, ...patch, page: patch.page ?? 1 })
    },
    [filters, push]
  )

  const reset = React.useCallback(() => {
    router.replace(pathname, { scroll: false })
  }, [pathname, router])

  const activeCount = React.useMemo(
    () =>
      Object.entries(filters).filter(([key, value]) => {
        if (NON_FILTER_KEYS.has(key)) return false
        return (
          String(value) !== String(DEFAULT_FILTERS[key as keyof FiltersState])
        )
      }).length,
    [filters]
  )

  /** Shape accepted by the API/query layer. */
  const queryInput = React.useMemo<BusinessFiltersInput>(
    () => ({
      search: filters.search || undefined,
      category: filters.category || undefined,
      country: filters.country || undefined,
      city: filters.city || undefined,
      state: filters.state || undefined,
      minRating: filters.minRating ? Number(filters.minRating) : undefined,
      minReviews: filters.minReviews ? Number(filters.minReviews) : undefined,
      website: filters.website as BusinessFiltersInput["website"],
      phone: filters.phone as BusinessFiltersInput["phone"],
      instagram: filters.instagram as BusinessFiltersInput["instagram"],
      whatsapp: filters.whatsapp as BusinessFiltersInput["whatsapp"],
      collectedFrom: filters.collectedFrom || undefined,
      collectedTo: filters.collectedTo || undefined,
      collectedFromTime: filters.collectedFromTime || undefined,
      collectedToTime: filters.collectedToTime || undefined,
      // Only sent when opting out, since the API already defaults to hiding.
      hideClosed: filters.hideClosed === "false" ? "false" : undefined,
      pipeline: filters.pipeline as BusinessFiltersInput["pipeline"],
      pipelineStage:
        (filters.pipelineStage as BusinessFiltersInput["pipelineStage"]) ||
        undefined,
      sortBy: filters.sortBy as BusinessFiltersInput["sortBy"],
      sortDir: filters.sortDir as BusinessFiltersInput["sortDir"],
      page: filters.page,
      pageSize: filters.pageSize,
    }),
    [filters]
  )

  return {
    filters,
    queryInput,
    setFilter,
    setFilters,
    reset,
    activeCount,
    hasActiveFilters: activeCount > 0,
  }
}
