"use client"

import * as React from "react"
import { cn } from "cn"
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Lightbulb,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Wand2,
  X,
} from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  formatWhatsAppPhone,
  WHATSAPP_MEDIA_PLACEHOLDERS,
  type WhatsAppMessageStatus,
  type WhatsAppMessageType,
} from "@/domain/whatsapp"
import type { WhatsAppMessageDTO } from "@/types/api"
import {
  useConversation,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
  useSuggestReply,
} from "@/viewmodels/use-whatsapp"

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
})
const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
})

function dayKey(value: string) {
  return new Date(value).toDateString()
}

function dayLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return "Hoje"
  if (date.toDateString() === yesterday.toDateString()) return "Ontem"
  return dayFormatter.format(date)
}

function StatusIcon({ status }: { status: WhatsAppMessageStatus }) {
  switch (status) {
    case "PENDING":
      return <Clock className="size-3.5" aria-label="Enviando" />
    case "SENT":
      return <Check className="size-3.5" aria-label="Enviada" />
    case "DELIVERED":
      return <CheckCheck className="size-3.5" aria-label="Entregue" />
    case "READ":
      return <CheckCheck className="size-3.5 text-sky-300" aria-label="Lida" />
    case "ERROR":
      return <AlertCircle className="size-3.5" aria-label="Falhou" />
    default:
      return null
  }
}

function MessageBubble({ message }: { message: WhatsAppMessageDTO }) {
  const type = message.type as WhatsAppMessageType
  const placeholder = WHATSAPP_MEDIA_PLACEHOLDERS[type]

  return (
    <div
      className={cn("flex", message.fromMe ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[78%] rounded-lg px-3 py-1.5 text-sm shadow-xs",
          message.fromMe
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted rounded-bl-sm"
        )}
      >
        {type !== "text" && placeholder ? (
          <p className="italic opacity-80">{placeholder}</p>
        ) : null}
        {message.body ? (
          <p className="break-words whitespace-pre-wrap">{message.body}</p>
        ) : null}
        <div
          className={cn(
            "tabular mt-0.5 flex items-center justify-end gap-1 text-[11px]",
            message.fromMe
              ? "text-primary-foreground/70"
              : "text-muted-foreground"
          )}
        >
          {timeFormatter.format(new Date(message.timestamp))}
          {message.fromMe ? (
            <StatusIcon status={message.status as WhatsAppMessageStatus} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Composer({
  conversationId,
  online,
  initialDraft = "",
}: {
  conversationId: string
  online: boolean
  initialDraft?: string
}) {
  const send = useSendMessage(conversationId)
  const suggest = useSuggestReply(conversationId)
  // A prefilled text (e.g. the AI approach) is only a draft: the user
  // reviews it and decides to send.
  const [draft, setDraft] = React.useState(initialDraft)
  /** Why Claude wrote what it wrote, and what to double-check. */
  const [rationale, setRationale] = React.useState<string | null>(null)
  const textarea = React.useRef<HTMLTextAreaElement>(null)

  const hasDraft = draft.trim().length > 0

  const submit = async () => {
    const text = draft.trim()
    if (!text || !online) return
    await send.mutateAsync(text)
    setDraft("")
    setRationale(null)
  }

  // With text in the box it polishes the draft; empty, it writes one.
  const requestSuggestion = async () => {
    const suggestion = await suggest.mutateAsync(hasDraft ? draft : undefined)
    setDraft(suggestion.reply)
    setRationale(suggestion.rationale || null)
    textarea.current?.focus()
  }

  return (
    <div className="space-y-2 border-t p-3">
      {suggest.isPending ? (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />O Claude está escrevendo.
          Pode levar até um minuto.
        </p>
      ) : rationale ? (
        <div className="bg-muted text-muted-foreground flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
          <p className="flex-1">{rationale}</p>
          <button
            type="button"
            onClick={() => setRationale(null)}
            className="hover:text-foreground shrink-0"
            aria-label="Fechar dica"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <Textarea
          ref={textarea}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter breaks the line, as in WhatsApp Web.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder={
            online
              ? "Digite uma mensagem..."
              : "Conecte o WhatsApp para enviar mensagens"
          }
          // Locked while Claude writes, so the suggestion never clobbers
          // something typed in the meantime.
          disabled={send.isPending || suggest.isPending}
          rows={1}
          className="max-h-40 min-h-10 resize-none"
          aria-label="Mensagem"
        />
        <Button
          variant="outline"
          onClick={requestSuggestion}
          disabled={suggest.isPending || send.isPending}
          aria-label={
            hasDraft ? "Melhorar texto com IA" : "Sugerir resposta com IA"
          }
          title={hasDraft ? "Melhorar texto com IA" : "Sugerir resposta com IA"}
        >
          {suggest.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : hasDraft ? (
            <Wand2 className="size-4" />
          ) : (
            <Sparkles className="size-4" />
          )}
          <span className="hidden lg:inline">
            {hasDraft ? "Melhorar" : "Sugerir resposta"}
          </span>
        </Button>
        <Button
          onClick={submit}
          disabled={!online || !hasDraft || send.isPending || suggest.isPending}
          aria-label="Enviar"
        >
          {send.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          <span className="hidden sm:inline">Enviar</span>
        </Button>
      </div>
    </div>
  )
}

export function ChatPanel({
  conversationId,
  online,
  initialDraft,
}: {
  conversationId: string
  online: boolean
  initialDraft?: string
}) {
  const detail = useConversation(conversationId)
  const messages = useMessages(conversationId)
  const markRead = useMarkConversationRead()
  const sentinel = React.useRef<HTMLDivElement>(null)

  const unread = detail.data?.conversation.unreadCount ?? 0
  const { mutate: markAsRead } = markRead
  React.useEffect(() => {
    if (unread > 0) markAsRead(conversationId)
  }, [conversationId, unread, markAsRead])

  // Older pages load when the top of the history scrolls into view.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = messages
  React.useEffect(() => {
    const node = sentinel.current
    if (!node || !hasNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) {
        void fetchNextPage()
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Newest first, as the API returns them; the column-reverse container
  // shows them bottom-up and keeps the scroll pinned to the latest message.
  const items = messages.data?.pages.flatMap((page) => page.items) ?? []
  const rows: React.ReactNode[] = []
  items.forEach((message, index) => {
    rows.push(<MessageBubble key={message.id} message={message} />)
    const older = items[index + 1]
    if (!older || dayKey(older.timestamp) !== dayKey(message.timestamp)) {
      rows.push(
        <div key={`day-${message.id}`} className="flex justify-center py-2">
          <span className="bg-muted text-muted-foreground rounded-full px-3 py-0.5 text-xs capitalize">
            {dayLabel(message.timestamp)}
          </span>
        </div>
      )
    }
  })

  const conversation = detail.data?.conversation

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        {conversation ? (
          <div className="min-w-0">
            <p className="truncate font-medium">{conversation.title}</p>
            {conversation.phone ? (
              <p className="text-muted-foreground text-xs">
                {formatWhatsAppPhone(conversation.phone)}
              </p>
            ) : null}
          </div>
        ) : (
          <Skeleton className="h-10 w-48" />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col-reverse gap-1.5 overflow-y-auto p-4">
        {messages.isError ? (
          <ErrorState error={messages.error} />
        ) : messages.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton
                key={index}
                className={cn("h-10 w-2/3", index % 2 && "ml-auto")}
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma mensagem salva"
            description="As mensagens desta conversa aparecem aqui."
          />
        ) : (
          <>
            {rows}
            <div ref={sentinel} className="flex justify-center py-1">
              {isFetchingNextPage ? (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              ) : null}
            </div>
          </>
        )}
      </div>

      <Composer
        conversationId={conversationId}
        online={online}
        initialDraft={initialDraft}
      />
    </div>
  )
}
