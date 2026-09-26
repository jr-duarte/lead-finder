"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  sellerProfileSchema,
  type SellerProfileFormInput,
  type SellerProfileInput,
} from "@/schemas/settings"
import {
  useSellerProfile,
  useUpdateSellerProfile,
} from "@/viewmodels/use-settings"

/** What the user sells, fed to every approach Claude writes. */
export function SellerProfileForm() {
  const { data, isPending } = useSellerProfile()
  const update = useUpdateSellerProfile()

  const form = useForm<SellerProfileFormInput, unknown, SellerProfileInput>({
    resolver: zodResolver(sellerProfileSchema),
    defaultValues: { sellerName: "", offer: "", instructions: "" },
  })

  React.useEffect(() => {
    if (!data) return
    form.reset({
      sellerName: data.sellerName ?? "",
      offer: data.offer ?? "",
      instructions: data.instructions ?? "",
    })
  }, [data, form])

  if (isPending) return <Skeleton className="h-64 w-full" />

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => update.mutate(values))}
        className="space-y-5"
      >
        <FormField
          control={form.control}
          name="sellerName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seu nome ou empresa</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="Júnior, da Duarte Software"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="offer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>O que você oferece</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  rows={6}
                  placeholder="Ex.: crio sites e sistemas de pedido online para restaurantes, sem taxa por pedido. Entrega em 2 semanas, a partir de R$ 1.500."
                />
              </FormControl>
              <FormDescription>
                Serviço, para quem é, diferenciais e faixa de preço. Quanto mais
                concreto, melhor a abordagem.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="instructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tom e estilo (opcional)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  rows={3}
                  placeholder="Ex.: informal, tratar por você, sem emojis, nunca citar preço na primeira mensagem."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </form>
    </Form>
  )
}
