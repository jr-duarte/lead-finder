"use client"

import { cn } from "cn"
import { Briefcase, MessagesSquare, Search } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatWhatsAppPhone } from "@/domain/whatsapp"
import type { WhatsAppConversationDTO } from "@/types/api"
import { useConversations } from "@/viewmodels/use-whatsapp"

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
})
const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
})

/** Hour for today, day/month for older messages, like the WhatsApp app. */
function shortTime(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  const today = new Date()
  return date.toDateString() === today.toDateString()
    ? timeFormatter.format(date)
    : dayFormatter.format(date)
}

function ConversationItem({
  conversation,
  selected,
  onSelect,
}: {
  conversation: WhatsAppConversationDTO
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "hover:bg-muted/60 flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors",
        selected && "bg-muted"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="truncate font-medium">{conversation.title}</span>
        {conversation.businessId ? (
          <Briefcase
            className="text-primary size-3.5 shrink-0"
            aria-label="Vinculada a um lead"
          />
        ) : null}
        <span className="text-muted-foreground tabular ml-auto shrink-0 text-xs">
          {shortTime(conversation.lastMessageAt)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground truncate text-sm">
          {conversation.lastMessageFromMe ? "Você: " : ""}
          {conversation.lastMessage ||
            formatWhatsAppPhone(conversation.phone) ||
            "Sem mensagens"}
        </span>
        {conversation.unreadCount > 0 ? (
          <span className="bg-success text-success-foreground ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-medium">
            {conversation.unreadCount}
          </span>
        ) : null}
      </div>
    </button>
  )
}

export function ConversationList({
  search,
  query,
  onSearchChange,
  selectedId,
  onSelect,
}: {
  /** What the input shows. */
  search: string
  /** Debounced term actually sent to the server. */
  query: string
  onSearchChange: (value: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const conversations = useConversations(query)
  const items = conversations.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative border-b p-3">
        <Search className="text-muted-foreground absolute top-1/2 left-5 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="pl-8"
          aria-label="Buscar conversas"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {conversations.isError ? (
          <ErrorState error={conversations.error} />
        ) : conversations.isPending ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title={
              search ? "Nenhuma conversa encontrada" : "Nenhuma conversa ainda"
            }
            description={
              search
                ? "Tente outro nome ou número."
                : "As conversas aparecem aqui após a sincronização."
            }
          />
        ) : (
          <div className="space-y-0.5">
            {items.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedId}
                onSelect={() => onSelect(conversation.id)}
              />
            ))}
            {conversations.hasNextPage ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => conversations.fetchNextPage()}
                disabled={conversations.isFetchingNextPage}
              >
                {conversations.isFetchingNextPage
                  ? "Carregando..."
                  : "Carregar mais conversas"}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
