"use client"

import Link from "next/link"
import * as React from "react"
import { Building2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/layout/page-header"
import { SearchForm } from "@/components/searches/search-form"
import { SearchProgress } from "@/components/searches/search-progress"
import { isTerminal } from "@/domain/search"
import type { SearchFormData } from "@/schemas/search"
import {
  useCancelSearch,
  useCreateSearch,
  useSearch,
} from "@/viewmodels/use-searches"

export function NewSearchView() {
  const [searchId, setSearchId] = React.useState<string | null>(null)

  const create = useCreateSearch()
  const cancel = useCancelSearch()
  const running = useSearch(searchId ?? "")

  const handleSubmit = async (values: SearchFormData) => {
    const search = await create.mutateAsync(values)
    setSearchId(search.id)
  }

  const search = running.data
  const finished = search ? isTerminal(search.status) : false

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Nova busca"
        description="Configure os parâmetros da coleta de estabelecimentos."
      />

      {searchId && search ? (
        <div className="space-y-4">
          <SearchProgress
            search={search}
            onCancel={() => cancel.mutate(searchId)}
            isCancelling={cancel.isPending}
          />

          <div className="flex flex-wrap gap-2">
            {finished ? (
              <Button asChild>
                <Link href="/businesses">
                  <Building2 className="size-4" />
                  Ver empresas coletadas
                </Link>
              </Button>
            ) : null}

            <Button variant="outline" onClick={() => setSearchId(null)}>
              Nova busca
            </Button>

            <Button variant="ghost" asChild>
              <Link href="/searches">Ver todas as buscas</Link>
            </Button>
          </div>
        </div>
      ) : (
        <SearchForm onSubmit={handleSubmit} isSubmitting={create.isPending} />
      )}
    </div>
  )
}
