"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BUSINESS_STATUS, BUSINESS_STATUS_LABELS } from "@/domain/business"
import {
  businessUpdateSchema,
  type BusinessUpdateFormInput,
  type BusinessUpdateInput,
} from "@/schemas/business"
import type { BusinessDTO } from "@/types/api"
import { useUpdateBusiness } from "@/viewmodels/use-businesses"

/** Edit form for a single business. Validation lives entirely in Zod. */
export function BusinessEditDialog({
  business,
  open,
  onOpenChange,
}: {
  business: BusinessDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateBusiness(business?.id ?? "")

  const form = useForm<BusinessUpdateFormInput, unknown, BusinessUpdateInput>({
    resolver: zodResolver(businessUpdateSchema),
    defaultValues: {
      name: "",
      category: "",
      phone: "",
      website: "",
      status: "NEW",
      instagram: "",
      address: { city: "", state: "" },
    },
  })

  // Repopulate whenever a different business is opened.
  React.useEffect(() => {
    if (!business) return

    form.reset({
      name: business.name,
      category: business.category ?? "",
      phone: business.phone ?? "",
      website: business.website ?? "",
      rating: business.rating,
      reviewsCount: business.reviewsCount,
      status: business.status,
      instagram: business.enrichment?.socials?.instagram ?? "",
      address: {
        street: business.address?.street ?? "",
        number: business.address?.number ?? "",
        neighborhood: business.address?.neighborhood ?? "",
        city: business.address?.city ?? "",
        state: business.address?.state ?? "",
        postalCode: business.address?.postalCode ?? "",
      },
    })
  }, [business, form])

  const onSubmit = form.handleSubmit(async (values) => {
    await update.mutateAsync(values)
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar empresa</DialogTitle>
          <DialogDescription>
            Ajuste manualmente os dados coletados desta empresa.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form noValidate onSubmit={onSubmit} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nome da empresa" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Restaurante" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BUSINESS_STATUS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {BUSINESS_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="+5511999999999" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instagram</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="usuario" />
                    </FormControl>
                    <FormDescription>Apenas o usuário, sem @.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://exemplo.com.br" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rating</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        max={5}
                        {...field}
                        value={(field.value as number | undefined) ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reviewsCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avaliações</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        value={(field.value as number | undefined) ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address.city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address.state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
