"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatDate } from "@/lib/format"

/**
 * "2026-10-01" as local midnight. `new Date("2026-10-01")` would be UTC
 * midnight, which in Brazil is still the day before, so the calendar and the
 * label showed the wrong day.
 */
function toDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  )
  return Number.isNaN(date.getTime()) ? undefined : date
}

function toIsoDay(date?: Date): string {
  if (!date) return ""
  // Local date parts avoid the off-by-one that toISOString can introduce.
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Date-picker range filter for the collection date. */
export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}) {
  const [open, setOpen] = React.useState(false)

  const selected: DateRange | undefined = React.useMemo(() => {
    const fromDate = toDate(from)
    const toDateValue = toDate(to)
    if (!fromDate && !toDateValue) return undefined
    return { from: fromDate, to: toDateValue }
  }, [from, to])

  const label = React.useMemo(() => {
    if (!from && !to) return "Qualquer data"
    const fromDate = toDate(from)
    const toDateValue = toDate(to)
    if (from && to && from === to) return formatDate(fromDate)
    if (from && to)
      return `${formatDate(fromDate)} – ${formatDate(toDateValue)}`
    if (from) return `A partir de ${formatDate(fromDate)}`
    return `Até ${formatDate(toDateValue)}`
  }, [from, to])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !from && !to && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={toDate(from)}
          selected={selected}
          // With a full range picked, a click starts a new one instead of
          // moving one of its ends.
          resetOnSelect
          onSelect={(range) => {
            onChange({ from: toIsoDay(range?.from), to: toIsoDay(range?.to) })
            if (range?.from && range.to) setOpen(false)
          }}
        />
        <div className="flex justify-end border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({ from: "", to: "" })
              setOpen(false)
            }}
          >
            Limpar data
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
