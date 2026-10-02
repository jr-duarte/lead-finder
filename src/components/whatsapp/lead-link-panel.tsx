"use client"

import * as React from "react"
import Link from "next/link"
import { Briefcase, ExternalLink, Link2, Unlink } from "lucide-react"

import { PipelineStageBadge } from "@/components/pipeline/pipeline-stage-badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { formatWhatsAppPhone } from "@/domain/whatsapp"
import {
  useConversation,
  useLeadSearch,
  useLinkLead,
} from "@/viewmodels/use-whatsapp"

function LeadPicker({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = React.useState(false)
  const [term, setTerm] = React.useState("")
  const results = useLeadSearch(term)
  const link = useLinkLead(conversationId)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Link2 className="size-4" />
          Vincular a um lead
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {/* Filtering happens on the server, so cmdk's own filter is off. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Buscar empresa pelo nome..."
          />
          <CommandList>
            <CommandEmpty>
              {term.trim().length < 2
                ? "Digite ao menos 2 letras."
                : "Nenhuma empresa encontrada."}
            </CommandEmpty>
            {results.data?.items.length ? (
              <CommandGroup>
                {results.data.items.map((business) => (
                  <CommandItem
                    key={business.id}
                    value={business.id}
                    onSelect={() => {
                      link.mutate(business.id)
                      setOpen(false)
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate">{business.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[business.category, business.address?.city]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Contact details and the lead this conversation belongs to. */
export function LeadLinkPanel({ conversationId }: { conversationId: string }) {
  const detail = useConversation(conversationId)
  const link = useLinkLead(conversationId)

  if (detail.isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (!detail.data) return null

  const { conversation, contact, lead } = detail.data
  const phone = contact?.phone ?? conversation.phone

  return (
    <div className="space-y-4 p-4 text-sm">
      <section className="space-y-1">
        <h3 className="text-muted-foreground text-xs font-medium uppercase">
          Contato
        </h3>
        <p className="font-medium">{conversation.title}</p>
        {phone ? (
          <p className="text-muted-foreground">{formatWhatsAppPhone(phone)}</p>
        ) : null}
        {contact?.pushName && contact.pushName !== conversation.title ? (
          <p className="text-muted-foreground text-xs">
            Nome no perfil: {contact.pushName}
          </p>
        ) : null}
      </section>

      <Separator />

      <section className="space-y-2">
        <h3 className="text-muted-foreground text-xs font-medium uppercase">
          Lead
        </h3>
        {lead ? (
          <>
            <div className="flex items-start gap-2">
              <Briefcase className="text-primary mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">{lead.name}</p>
                {lead.category ? (
                  <p className="text-muted-foreground text-xs">
                    {lead.category}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Status</span>
              {lead.stage ? (
                <PipelineStageBadge stage={lead.stage} />
              ) : (
                <span className="text-muted-foreground text-xs">
                  Fora do funil
                </span>
              )}
            </div>
            {conversation.leadLinkSource === "auto" ? (
              <p className="text-muted-foreground text-xs">
                Vinculado automaticamente pelo telefone.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link href={`/businesses/${lead.id}`}>
                  <ExternalLink className="size-4" />
                  Ver lead
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => link.mutate(null)}
                disabled={link.isPending}
                aria-label="Desvincular lead"
              >
                <Unlink className="size-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              Esta conversa não está vinculada a nenhum lead.
            </p>
            <LeadPicker conversationId={conversationId} />
          </>
        )}
      </section>
    </div>
  )
}
