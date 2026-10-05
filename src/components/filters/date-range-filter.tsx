"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

type Range = { from: string; to: string; fromTime: string; toTime: string }

/** "01/10/2026" or "01/10/2026 08:00". */
function withTime(date: Date | undefined, time: string): string {
  return time ? `${formatDate(date)} ${time}` : formatDate(date)
}

/** Date-picker range filter for the collection date, with optional times. */
export function DateRangeFilter({
  from,
  to,
  fromTime,
  toTime,
  onChange,
}: {
  from: string
  to: string
  /** "HH:mm"; only applies while `from` is set. */
  fromTime: string
  /** "HH:mm"; only applies while `to` is set. */
  toTime: string
  onChange: (range: Range) => void
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
    if (from && to && from === to) {
      if (!fromTime && !toTime) return formatDate(fromDate)
      return `${formatDate(fromDate)}, ${fromTime || "00:00"} – ${toTime || "23:59"}`
    }
    if (from && to)
      return `${withTime(fromDate, fromTime)} – ${withTime(toDateValue, toTime)}`
    if (from) return `A partir de ${withTime(fromDate, fromTime)}`
    return `Até ${withTime(toDateValue, toTime)}`
  }, [from, to, fromTime, toTime])

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
          // The popover stays open after a range is picked, so the times can
          // be set right below it.
          onSelect={(range) => {
            const nextFrom = toIsoDay(range?.from)
            const nextTo = toIsoDay(range?.to)
            onChange({
              from: nextFrom,
              to: nextTo,
              // A time without its day would be ignored, so it is dropped.
              fromTime: nextFrom ? fromTime : "",
              toTime: nextTo ? toTime : "",
            })
          }}
        />
        <div className="grid grid-cols-2 gap-3 border-t p-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="collected-from-time"
              className="text-muted-foreground text-xs"
            >
              Hora inicial
            </Label>
            <Input
              id="collected-from-time"
              type="time"
              value={fromTime}
              disabled={!from}
              onChange={(event) =>
                onChange({ from, to, fromTime: event.target.value, toTime })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="collected-to-time"
              className="text-muted-foreground text-xs"
            >
              Hora final
            </Label>
            <Input
              id="collected-to-time"
              type="time"
              value={toTime}
              disabled={!to}
              onChange={(event) =>
                onChange({ from, to, fromTime, toTime: event.target.value })
              }
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({ from: "", to: "", fromTime: "", toTime: "" })
              setOpen(false)
            }}
          >
            Limpar data
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
