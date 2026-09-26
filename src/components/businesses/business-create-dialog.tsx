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
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  businessCreateSchema,
  type BusinessCreateFormInput,
  type BusinessCreateInput,
} from "@/schemas/business"
import { useCreateBusiness } from "@/viewmodels/use-pipeline"

const EMPTY: BusinessCreateFormInput = {
  name: "",
  cnpj: "",
  category: "",
  phone: "",
  website: "",
  instagram: "",
  email: "",
  addToPipeline: true,
  address: { street: "", number: "", neighborhood: "", city: "", state: "" },
}

/** Manual lead entry, for businesses found outside a collection run. */
export function BusinessCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateBusiness()

  const form = useForm<BusinessCreateFormInput, unknown, BusinessCreateInput>({
    resolver: zodResolver(businessCreateSchema),
    defaultValues: EMPTY,
  })

  const onSubmit = form.handleSubmit(async (values) => {
    await create.mutateAsync(values)
    form.reset(EMPTY)
    onOpenChange(false)
  })

  // A fresh form every time the dialog opens.
  React.useEffect(() => {
    if (open) form.reset(EMPTY)
  }, [open, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova empresa</DialogTitle>
          <DialogDescription>
            Cadastre um lead manualmente. Apenas o nome é obrigatório.
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
                    <Input {...field} placeholder="Restaurante Silva" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CNPJ</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="12.345.678/0001-90"
                    />
                  </FormControl>
                  <FormDescription>
                    Ao salvar, os dados cadastrais são consultados na Receita.
                  </FormDescription>
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
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="(11) 99999-9999" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="contato@empresa.com.br" />
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
                      <Input {...field} placeholder="empresa" />
                    </FormControl>
                    <FormDescription>Sem o @.</FormDescription>
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
                    <Input {...field} placeholder="https://empresa.com.br" />
                  </FormControl>
                  <FormDescription>
                    Com website, o lead pode ser enriquecido depois.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div className="grid gap-5 sm:grid-cols-2">
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
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="SP"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address.street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rua</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address.neighborhood"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <FormField
              control={form.control}
              name="addToPipeline"
              render={({ field }) => (
                <FormItem orientation="horizontal">
                  <div className="space-y-0.5">
                    <FormLabel>Adicionar ao funil</FormLabel>
                    <FormDescription>
                      Cria o lead já na coluna &quot;Novo&quot; do funil.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Cadastrando..." : "Cadastrar empresa"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
