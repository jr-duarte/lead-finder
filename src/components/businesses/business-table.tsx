"use client"

import Link from "next/link"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AtSign,
  Building2,
  ExternalLink,
  Eye,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Star,
} from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  OPERATIONAL_STATUS_BADGES,
  OPERATIONAL_STATUS_LABELS,
} from "@/domain/business"
import { BusinessStatusBadge } from "@/components/businesses/business-status-badge"
import { BusinessTableSkeleton } from "@/components/businesses/business-table-skeleton"
import { EmptyState } from "@/components/common/empty-state"
import {
  formatDate,
  formatNumber,
  formatPhone,
  formatRating,
  formatWebsiteLabel,
} from "@/lib/format"
import type { BusinessDTO } from "@/types/api"

const COLUMN_COUNT = 12

type SortableColumn =
  "name" | "rating" | "reviewsCount" | "collectedAt" | "city"

/** Sortable column header. Defined at module level so React keeps its identity
 * across renders. */
function SortButton({
  column,
  children,
  align = "left",
  sortBy,
  sortDir,
  onSort,
}: {
  column: SortableColumn
  children: ReactNode
  align?: "left" | "right"
  sortBy: string
  sortDir: string
  onSort: (column: SortableColumn) => void
}) {
  const active = sortBy === column
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onSort(column)}
      className={cn(
        "-ml-2 h-8 gap-1.5 font-medium",
        align === "right" && "-mr-2 ml-0"
      )}
    >
      {children}
      <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-40")} />
    </Button>
  )
}

export function BusinessTable({
  businesses,
  isLoading,
  selectedIds,
  onToggleRow,
  onToggleAll,
  sortBy,
  sortDir,
  onSort,
  onEnrich,
  onEdit,
  emptyAction,
  hasActiveFilters,
}: {
  businesses: BusinessDTO[]
  isLoading?: boolean
  selectedIds: string[]
  onToggleRow: (id: string) => void
  onToggleAll: (checked: boolean) => void
  sortBy: string
  sortDir: string
  onSort: (column: SortableColumn) => void
  onEnrich: (id: string) => void
  onEdit: (business: BusinessDTO) => void
  emptyAction?: ReactNode
  hasActiveFilters?: boolean
}) {
  const allSelected =
    businesses.length > 0 && selectedIds.length === businesses.length
  const someSelected = selectedIds.length > 0 && !allSelected

  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected || (someSelected && "indeterminate")}
                  onCheckedChange={(checked) => onToggleAll(checked === true)}
                  aria-label="Selecionar todas as empresas"
                  disabled={businesses.length === 0}
                />
              </TableHead>
              <TableHead className="min-w-52">
                <SortButton
                  column="name"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                >
                  Nome
                </SortButton>
              </TableHead>
              <TableHead className="min-w-32">Categoria</TableHead>
              <TableHead className="min-w-32">
                <SortButton
                  column="city"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                >
                  Cidade
                </SortButton>
              </TableHead>
              <TableHead className="min-w-36">Telefone</TableHead>
              <TableHead className="min-w-40">Website</TableHead>
              <TableHead className="text-right">
                <SortButton
                  column="rating"
                  align="right"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                >
                  Rating
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton
                  column="reviewsCount"
                  align="right"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                >
                  Avaliações
                </SortButton>
              </TableHead>
              <TableHead className="min-w-32">Instagram</TableHead>
              <TableHead className="min-w-28">Status</TableHead>
              <TableHead className="min-w-28">
                <SortButton
                  column="collectedAt"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                >
                  Coleta
                </SortButton>
              </TableHead>
              <TableHead className="bg-card sticky right-0 w-14 text-right shadow-[inset_1px_0_0_0_var(--border)]">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <BusinessTableSkeleton columns={COLUMN_COUNT} />
            ) : businesses.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMN_COUNT} className="p-0">
                  <EmptyState
                    icon={Building2}
                    title="Nenhuma empresa encontrada"
                    description={
                      hasActiveFilters
                        ? "Tente alterar os filtros ou realizar uma nova busca."
                        : "Realize uma nova busca para começar a coletar empresas."
                    }
                    action={emptyAction}
                  />
                </TableCell>
              </TableRow>
            ) : (
              businesses.map((business) => {
                const selected = selectedIds.includes(business.id)
                const instagram = business.enrichment?.socials?.instagram

                return (
                  <TableRow
                    key={business.id}
                    data-state={selected ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => onToggleRow(business.id)}
                        aria-label={`Selecionar ${business.name}`}
                      />
                    </TableCell>

                    <TableCell>
                      <Link
                        href={`/businesses/${business.id}`}
                        className="font-medium hover:underline"
                      >
                        {business.name}
                      </Link>
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {business.category ?? "—"}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {business.address?.city ?? "—"}
                    </TableCell>

                    <TableCell className="tabular">
                      {formatPhone(business.phone)}
                    </TableCell>

                    <TableCell>
                      {business.website ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={business.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary inline-flex max-w-40 items-center gap-1 truncate hover:underline"
                            >
                              <span className="truncate">
                                {formatWebsiteLabel(business.website)}
                              </span>
                              <ExternalLink className="size-3 shrink-0" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>{business.website}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="tabular text-right">
                      {business.rating ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="size-3.5 fill-current text-amber-500" />
                          {formatRating(business.rating)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="tabular text-muted-foreground text-right">
                      {formatNumber(business.reviewsCount)}
                    </TableCell>

                    <TableCell>
                      {instagram ? (
                        <a
                          href={`https://instagram.com/${instagram}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          <AtSign className="size-3.5 shrink-0" />
                          <span className="truncate">@{instagram}</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <BusinessStatusBadge status={business.status} />
                        {business.operationalStatus &&
                        business.operationalStatus !== "OPERATIONAL" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="border-destructive/40 text-destructive bg-destructive/10"
                              >
                                {
                                  OPERATIONAL_STATUS_BADGES[
                                    business.operationalStatus
                                  ]
                                }
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {
                                OPERATIONAL_STATUS_LABELS[
                                  business.operationalStatus
                                ]
                              }
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell className="tabular text-muted-foreground">
                      {formatDate(business.collectedAt)}
                    </TableCell>

                    <TableCell className="bg-card sticky right-0 text-right shadow-[inset_1px_0_0_0_var(--border)]">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Ações para ${business.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/businesses/${business.id}`}>
                              <Eye className="size-4" />
                              Visualizar
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEdit(business)}>
                            <Pencil className="size-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onEnrich(business.id)}
                            disabled={!business.website}
                          >
                            <Sparkles className="size-4" />
                            Enriquecer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
