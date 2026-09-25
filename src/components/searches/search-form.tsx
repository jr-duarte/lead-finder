"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  searchFormSchema,
  type SearchFormData,
  type SearchFormInput,
} from "@/schemas/search"
import { useSourceInfo } from "@/viewmodels/use-source"

/** Preset coordinates so the form is usable without looking up lat/lng. */
const PRESETS = [
  { label: "São Paulo, SP", lat: -23.5505, lng: -46.6333 },
  { label: "Rio de Janeiro, RJ", lat: -22.9068, lng: -43.1729 },
  { label: "Belo Horizonte, MG", lat: -19.9167, lng: -43.9345 },
  { label: "Curitiba, PR", lat: -25.4284, lng: -49.2733 },
  { label: "Porto Alegre, RS", lat: -30.0346, lng: -51.2177 },
]

export function SearchForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (values: SearchFormData) => void
  isSubmitting?: boolean
}) {
  const form = useForm<SearchFormInput, unknown, SearchFormData>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      category: "",
      location: "São Paulo, SP",
      latitude: "",
      longitude: "",
      radiusMeters: 3000,
      limit: 60,
    },
  })

  const sourceInfo = useSourceInfo()
  // Each source honours a different ceiling, so the form reflects the real one.
  const maxResults = sourceInfo.data?.maxResults ?? 500

  // useWatch subscribes without re-rendering the whole form on every keystroke.
  const [latitude, longitude] = useWatch({
    control: form.control,
    name: ["latitude", "longitude"],
  })
  const hasCoordinates =
    latitude !== "" &&
    latitude !== undefined &&
    longitude !== "" &&
    longitude !== undefined

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    form.setValue("location", preset.label, { shouldValidate: true })
    form.setValue("latitude", preset.lat, { shouldValidate: true })
    form.setValue("longitude", preset.lng, { shouldValidate: true })
  }

  /** Back to locating purely by the text field. */
  const clearCoordinates = () => {
    form.setValue("latitude", "", { shouldValidate: true })
    form.setValue("longitude", "", { shouldValidate: true })
  }

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => {
          if (values.limit > maxResults) {
            form.setError("limit", {
              message: `${sourceInfo.data?.label ?? "A fonte atual"} retorna no máximo ${maxResults} por busca.`,
            })
            return
          }
          onSubmit(values)
        })}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que buscar</CardTitle>
            <CardDescription>
              Defina a categoria de estabelecimento e a cidade alvo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Restaurante, Padaria, Academia..."
                    />
                  </FormControl>
                  <FormDescription>
                    Tipo de estabelecimento a coletar.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Localização</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="São Paulo, SP" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearCoordinates}
              >
                Limpar coordenadas
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Área de cobertura</CardTitle>
            <CardDescription>
              As coordenadas são opcionais: sem elas, a área vem do campo
              Localização. Informe-as para restringir a um ponto específico.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="latitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Latitude (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      {...field}
                      value={(field.value as string | number | undefined) ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="longitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Longitude (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      {...field}
                      value={(field.value as string | number | undefined) ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="radiusMeters"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raio (metros)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={100}
                      max={50000}
                      step={100}
                      disabled={!hasCoordinates}
                      {...field}
                      value={(field.value as number | undefined) ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    {hasCoordinates
                      ? "Entre 100 e 50.000 metros, a partir das coordenadas."
                      : "Só se aplica quando há coordenadas."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={maxResults}
                      {...field}
                      value={(field.value as number | undefined) ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    {sourceInfo.data
                      ? `Até ${maxResults} por busca em ${sourceInfo.data.label}.`
                      : "Máximo de estabelecimentos a coletar."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={isSubmitting}>
            <Play className="size-4" />
            {isSubmitting ? "Iniciando..." : "Iniciar busca"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
