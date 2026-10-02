"use client"

import * as React from "react"
import { cn } from "cn"
import { Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SendWindow } from "@/domain/campaign"
import type { CampaignDTO } from "@/types/api"
import { useUpdateCampaign } from "@/viewmodels/use-campaigns"

const DAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
]

const HOURS = Array.from({ length: 25 }, (_, hour) => hour)

/** "2026-10-08T10:00" in the browser's time zone, for datetime-local. */
function toLocalInput(value?: string): string {
  if (!value) return ""
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function HourSelect({
  value,
  onChange,
  hours,
  disabled,
  label,
}: {
  value: number
  onChange: (hour: number) => void
  hours: number[]
  disabled?: boolean
  label: string
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => onChange(Number(next))}
      disabled={disabled}
    >
      <SelectTrigger className="w-24" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {hours.map((hour) => (
          <SelectItem key={hour} value={String(hour)}>
            {String(hour).padStart(2, "0")}:00
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Pace and schedule of a campaign. */
export function CampaignSettingsCard({
  campaign,
  disabled,
}: {
  campaign: CampaignDTO
  disabled?: boolean
}) {
  const update = useUpdateCampaign(campaign.id)
  const [intervalText, setIntervalText] = React.useState(
    String(campaign.intervalMinutes)
  )
  const [window, setWindow] = React.useState<SendWindow>(campaign.window)
  const [startAt, setStartAt] = React.useState(toLocalInput(campaign.startAt))

  const toggleDay = (day: number) =>
    setWindow((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day],
    }))

  const intervalValue = Number(intervalText)
  const invalid =
    !Number.isInteger(intervalValue) ||
    intervalValue < 2 ||
    window.days.length === 0 ||
    window.endHour <= window.startHour

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ritmo e horário</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="campaign-interval">Intervalo entre envios</Label>
            <div className="flex items-center gap-2">
              <Input
                id="campaign-interval"
                type="number"
                min={2}
                value={intervalText}
                onChange={(event) => setIntervalText(event.target.value)}
                disabled={disabled}
                className="w-24"
              />
              <span className="text-muted-foreground text-sm">minutos</span>
            </div>
            <p className="text-muted-foreground text-xs">
              Cada intervalo varia um pouco para não parecer automático.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="campaign-start">Começar a partir de</Label>
            <Input
              id="campaign-start"
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              disabled={disabled}
              className="w-auto"
            />
            <p className="text-muted-foreground text-xs">
              Vazio: começa assim que você iniciar.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Dias de envio</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((day) => {
              const active = window.days.includes(day.value)
              return (
                <Button
                  key={day.value}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  onClick={() => toggleDay(day.value)}
                  disabled={disabled}
                  className={cn("w-12")}
                >
                  {day.label}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Horário de envio (horário de Brasília)</Label>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">das</span>
            <HourSelect
              label="Hora inicial"
              value={window.startHour}
              onChange={(startHour) =>
                setWindow((current) => ({ ...current, startHour }))
              }
              hours={HOURS.slice(0, 24)}
              disabled={disabled}
            />
            <span className="text-muted-foreground">às</span>
            <HourSelect
              label="Hora final"
              value={window.endHour}
              onChange={(endHour) =>
                setWindow((current) => ({ ...current, endHour }))
              }
              hours={HOURS.slice(1)}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() =>
              update.mutate({
                intervalMinutes: intervalValue,
                window,
                startAt: startAt ? new Date(startAt).toISOString() : null,
              })
            }
            disabled={disabled || invalid || update.isPending}
          >
            <Save className="size-4" />
            {update.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
