"use client"

import * as React from "react"
import { cn } from "cn"
import {
  Briefcase,
  MessageSquarePlus,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { NewConversationDialog } from "@/components/whatsapp/new-conversation-dialog"
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
  collapsed = false,
  onCollapsedChange,
}: {
  /** What the input shows. */
  search: string
  /** Debounced term actually sent to the server. */
  query: string
  onSearchChange: (value: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
  /** Shrunk to a thin rail, leaving the room to the chat. */
  collapsed?: boolean
  /** Absent where collapsing makes no sense (phones). */
  onCollapsedChange?: (collapsed: boolean) => void
}) {
  const conversations = useConversations(query)
  const items = conversations.data?.pages.flatMap((page) => page.items) ?? []
  const [creating, setCreating] = React.useState(false)
  // A search that is a phone number seeds the new-conversation form.
  const searchedPhone = /^[\d\s()+-]{8,}$/.test(search.trim())
    ? search.trim()
    : ""

  const dialog = (
    <NewConversationDialog
      open={creating}
      onOpenChange={setCreating}
      initialPhone={searchedPhone}
      onStarted={(id) => {
        onSearchChange("")
        onSelect(id)
      }}
    />
  )

  if (collapsed) {
    // Counted over what is loaded: enough to tell something new arrived.
    const unreadChats = items.filter((item) => item.unreadCount > 0).length
    return (
      <div className="flex min-h-0 flex-col items-center gap-2 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapsedChange?.(false)}
          aria-label="Mostrar conversas"
          title="Mostrar conversas"
        >
          <PanelLeftOpen className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCreating(true)}
          aria-label="Nova conversa"
          title="Nova conversa"
        >
          <MessageSquarePlus className="size-4" />
        </Button>
        {unreadChats > 0 ? (
          <button
            type="button"
            onClick={() => onCollapsedChange?.(false)}
            className="bg-success text-success-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium"
            title={`${unreadChats} conversa(s) com mensagens não lidas`}
            aria-label={`${unreadChats} conversa(s) com mensagens não lidas`}
          >
            {unreadChats}
          </button>
        ) : null}
        {dialog}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        {onCollapsedChange ? (
          <Button
            variant="ghost"
            size="icon"
            className="hidden shrink-0 md:inline-flex"
            onClick={() => onCollapsedChange(true)}
            aria-label="Recolher conversas"
            title="Recolher conversas"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        ) : null}
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Nome ou telefone"
            className="pl-8"
            aria-label="Buscar conversas"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCreating(true)}
          aria-label="Nova conversa"
          title="Nova conversa"
        >
          <MessageSquarePlus className="size-4" />
        </Button>
      </div>

      {dialog}

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
              searchedPhone
                ? "Ainda não há conversa com esse número."
                : search
                  ? "Tente outro nome ou número."
                  : "As conversas aparecem aqui após a sincronização."
            }
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <MessageSquarePlus className="size-4" />
                {searchedPhone ? "Conversar com esse número" : "Nova conversa"}
              </Button>
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
