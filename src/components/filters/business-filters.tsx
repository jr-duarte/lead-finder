"use client"

import * as React from "react"
import { Download, Search as SearchIcon, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Combobox } from "@/components/filters/combobox"
import { DateRangeFilter } from "@/components/filters/date-range-filter"
import type { FiltersState } from "@/viewmodels/use-business-filters"
import type { FilterOptionsDTO } from "@/types/api"

const PRESENCE_OPTIONS = [
  { value: "any", label: "Todos" },
  { value: "yes", label: "Com" },
  { value: "no", label: "Sem" },
]

const RATING_OPTIONS = [
  { value: "", label: "Qualquer" },
  { value: "3", label: "3.0+" },
  { value: "3.5", label: "3.5+" },
  { value: "4", label: "4.0+" },
  { value: "4.5", label: "4.5+" },
]

/**
 * Filter bar for the businesses table. Presentational: all state lives in the
 * useBusinessFilters viewmodel.
 */
export function BusinessFilters({
  filters,
  options,
  activeCount,
  onChange,
  onReset,
  onExport,
  isExportDisabled,
}: {
  filters: FiltersState
  options?: FilterOptionsDTO
  activeCount: number
  onChange: (patch: Partial<FiltersState>) => void
  onReset: () => void
  onExport: () => void
  isExportDisabled?: boolean
}) {
  // Local mirror so typing stays responsive; the URL updates after a pause.
  const [searchDraft, setSearchDraft] = React.useState(filters.search)

  // Re-sync when the URL changes from elsewhere (back button, "limpar
  // filtros"). Comparing against the previous value during render avoids the
  // cascading re-render an effect would cause.
  const [lastAppliedSearch, setLastAppliedSearch] = React.useState(
    filters.search
  )
  if (filters.search !== lastAppliedSearch) {
    setLastAppliedSearch(filters.search)
    setSearchDraft(filters.search)
  }

  React.useEffect(() => {
    if (searchDraft === filters.search) return

    const timer = setTimeout(() => {
      onChange({ search: searchDraft })
    }, 400)

    return () => clearTimeout(timer)
  }, [searchDraft, filters.search, onChange])

  return (
    <div className="bg-card space-y-4 rounded-lg border p-4">
      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Buscar empresa, categoria ou cidade..."
          className="pl-9"
          aria-label="Buscar empresa"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Categoria</Label>
          <Combobox
            options={options?.categories ?? []}
            value={filters.category}
            onChange={(value) => onChange({ category: value })}
            placeholder="Todas"
            searchPlaceholder="Buscar categoria..."
            allLabel="Todas as categorias"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Cidade</Label>
          <Combobox
            options={options?.cities ?? []}
            value={filters.city}
            onChange={(value) => onChange({ city: value })}
            placeholder="Todas"
            searchPlaceholder="Buscar cidade..."
            allLabel="Todas as cidades"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Estado</Label>
          <Combobox
            options={options?.states ?? []}
            value={filters.state}
            onChange={(value) => onChange({ state: value })}
            placeholder="Todos"
            searchPlaceholder="Buscar estado..."
            allLabel="Todos os estados"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">
            Data da coleta
          </Label>
          <DateRangeFilter
            from={filters.collectedFrom}
            to={filters.collectedTo}
            onChange={(range) =>
              onChange({ collectedFrom: range.from, collectedTo: range.to })
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Website</Label>
          <Select
            value={filters.website}
            onValueChange={(value) => onChange({ website: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESENCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} website
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Telefone</Label>
          <Select
            value={filters.phone}
            onValueChange={(value) => onChange({ phone: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESENCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} telefone
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Instagram</Label>
          <Select
            value={filters.instagram}
            onValueChange={(value) => onChange({ instagram: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESENCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} Instagram
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Rating mín.</Label>
            <Select
              value={filters.minRating}
              onValueChange={(value) =>
                onChange({ minRating: value === "__any__" ? "" : value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                {RATING_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value || "__any__"}
                    value={option.value || "__any__"}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="min-reviews"
              className="text-muted-foreground text-xs"
            >
              Avaliações mín.
            </Label>
            <Input
              id="min-reviews"
              type="number"
              min={0}
              inputMode="numeric"
              value={filters.minReviews}
              onChange={(event) => onChange({ minReviews: event.target.value })}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t pt-3">
        <Switch
          id="hide-closed"
          checked={filters.hideClosed !== "false"}
          onCheckedChange={(checked) =>
            onChange({ hideClosed: checked ? "true" : "false" })
          }
        />
        <div className="space-y-0.5">
          <Label htmlFor="hide-closed" className="font-normal">
            Ocultar empresas que encerraram
          </Label>
          <p className="text-muted-foreground text-xs">
            Negócios marcados no Google como encerrados ou fechados
            temporariamente. Não tem relação com horário de funcionamento.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={activeCount === 0}
          >
            <X className="size-4" />
            Limpar filtros
          </Button>
          {activeCount > 0 ? (
            <Badge variant="secondary">
              {activeCount}{" "}
              {activeCount === 1 ? "filtro ativo" : "filtros ativos"}
            </Badge>
          ) : null}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={isExportDisabled}
        >
          <Download className="size-4" />
          Exportar
        </Button>
      </div>
    </div>
  )
}
