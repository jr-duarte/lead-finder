"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { PageHeader } from "@/components/layout/page-header"

const THEMES = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
]

const ENV_VARS = [
  {
    name: "MONGODB_URI",
    description: "String de conexão do MongoDB.",
    example: "mongodb://127.0.0.1:27017/lead-finder",
  },
  {
    name: "PLACES_SOURCE",
    description:
      "Fonte de coleta: 'mock' (offline, determinística) ou 'osm' (OpenStreetMap).",
    example: "mock",
  },
  {
    name: "OVERPASS_ENDPOINT",
    description: "Endpoint da API Overpass usada pela fonte 'osm'.",
    example: "https://overpass-api.de/api/interpreter",
  },
  {
    name: "CRAWLER_CONCURRENCY",
    description: "Requisições simultâneas durante o enriquecimento.",
    example: "2",
  },
  {
    name: "CRAWLER_REQUEST_DELAY_MS",
    description: "Intervalo mínimo entre requisições, em milissegundos.",
    example: "1200",
  },
  {
    name: "CRAWLER_TIMEOUT_MS",
    description: "Tempo limite de cada requisição, em milissegundos.",
    example: "15000",
  },
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
        description="Preferências de interface e referência de ambiente."
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variáveis de ambiente</CardTitle>
          <CardDescription>
            Configuradas em <code className="text-xs">.env.local</code>.
            Reinicie o servidor após alterá-las.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {ENV_VARS.map((variable) => (
              <AccordionItem key={variable.name} value={variable.name}>
                <AccordionTrigger className="text-sm">
                  <span className="font-mono text-xs">{variable.name}</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2">
                  <p className="text-muted-foreground text-sm">
                    {variable.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">padrão</Badge>
                    <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                      {variable.example}
                    </code>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <Separator className="my-4" />

          <p className="text-muted-foreground text-xs">
            Todos os estabelecimentos encontrados são armazenados, com ou sem
            website. Os filtros de &quot;sem website&quot; são aplicados apenas
            na consulta.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
