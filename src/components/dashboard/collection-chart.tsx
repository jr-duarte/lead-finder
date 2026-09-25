"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const CHART_CONFIG = {
  count: {
    label: "Empresas coletadas",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

/** Daily collection volume over the recent window. */
export function CollectionChart({
  data,
}: {
  data: { date: string; count: number }[]
}) {
  const formatDay = (value: string) => {
    const [, month, day] = value.split("-")
    return `${day}/${month}`
  }

  return (
    <ChartContainer config={CHART_CONFIG} className="h-56 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
          tickFormatter={formatDay}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={32}
          allowDecimals={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatDay(String(label))}
            />
          }
        />
        <Area
          dataKey="count"
          type="monotone"
          stroke="var(--color-count)"
          fill="var(--color-count)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
