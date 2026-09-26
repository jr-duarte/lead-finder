"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/layout/page-header"

const THEMES = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
]

export function SettingsView() {
  const { theme, setTheme } = useTheme()

  // next-themes only knows the stored theme after hydration; useSyncExternal-
  // Store gives a stable server snapshot without a setState-in-effect.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Configurações"
        description="Preferências de interface."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aparência</CardTitle>
          <CardDescription>
            Escolha o tema da interface. &quot;Sistema&quot; acompanha a
            preferência do seu sistema operacional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!mounted ? (
            <Skeleton className="h-11 w-full max-w-sm" />
          ) : (
            <RadioGroup
              value={theme}
              onValueChange={setTheme}
              className="grid gap-3 sm:grid-cols-3"
            >
              {THEMES.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`theme-${option.value}`}
                  className="hover:bg-accent/50 has-data-[state=checked]:border-primary flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal"
                >
                  <RadioGroupItem
                    value={option.value}
                    id={`theme-${option.value}`}
                  />
                  <option.icon className="size-4" />
                  {option.label}
                </Label>
              ))}
            </RadioGroup>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
