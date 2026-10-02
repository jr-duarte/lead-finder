"use client"

import * as React from "react"
import { cn } from "cn"
import { toast } from "sonner"
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  FileAudio,
  FileVideo,
  Lightbulb,
  Loader2,
  MessageSquare,
  Mic,
  Paperclip,
  Reply,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ConversationActions } from "@/components/whatsapp/conversation-actions"
import { ContactAvatar } from "@/components/whatsapp/contact-avatar"
import { MessageMedia } from "@/components/whatsapp/message-media"
import { MessageQuote } from "@/components/whatsapp/message-quote"
import {
  formatWhatsAppPhone,
  outgoingMediaKind,
  type OutgoingMediaKind,
  WHATSAPP_SENDABLE_IMAGE_TYPES,
  type WhatsAppMessageStatus,
} from "@/domain/whatsapp"
import { useVoiceRecorder } from "@/hooks/use-voice-recorder"
import type { WhatsAppMessageDTO } from "@/types/api"
import {
  useConversation,
  useMarkConversationRead,
  useMessages,
  useSendMedia,
  useSendMessage,
  useSuggestReply,
  useWhatsAppStatus,
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

function MessageBubble({
  message,
  contactName,
  onReply,
  onJumpTo,
}: {
  message: WhatsAppMessageDTO
  contactName: string
  onReply?: (message: WhatsAppMessageDTO) => void
  onJumpTo: (whatsappMessageId: string) => void
}) {
  const quoted = message.quoted
  return (
    <div
      className={cn(
        "group flex items-center gap-1",
        message.fromMe ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        data-wa-id={message.whatsappMessageId}
        className={cn(
          "max-w-[78%] rounded-lg px-3 py-1.5 text-sm shadow-xs transition-shadow duration-500",
          message.fromMe
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted rounded-bl-sm"
        )}
      >
        {quoted ? (
          <MessageQuote
            quote={quoted}
            contactName={contactName}
            onBubble={message.fromMe ? "mine" : "theirs"}
            onClick={() => onJumpTo(quoted.whatsappMessageId)}
            className="-mx-1.5 mb-1 w-[calc(100%+0.75rem)]"
          />
        ) : null}
        {message.type !== "text" ? <MessageMedia message={message} /> : null}
        {message.body ? (
          <p className="wrap-break-word whitespace-pre-wrap">{message.body}</p>
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
      {onReply ? (
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => onReply(message)}
          aria-label="Responder"
          title="Responder"
        >
          <Reply className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}

type Attachment = {
  file: File
  kind: OutgoingMediaKind
  previewUrl?: string
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, "0")
  return `${minutes}:${seconds}`
}

function Composer({
  conversationId,
  online,
  initialDraft = "",
  replyTo,
  contactName,
  onClearReply,
}: {
  conversationId: string
  online: boolean
  initialDraft?: string
  /** The message being answered, shown above the box until sent. */
  replyTo: WhatsAppMessageDTO | null
  contactName: string
  onClearReply: () => void
}) {
  const send = useSendMessage(conversationId)
  const sendMedia = useSendMedia(conversationId)
  const suggest = useSuggestReply(conversationId)
  const recorder = useVoiceRecorder()
  const mediaEnabled = useWhatsAppStatus().data?.mediaEnabled ?? false
  // A prefilled text (e.g. the AI approach) is only a draft: the user
  // reviews it and decides to send.
  const [draft, setDraft] = React.useState(initialDraft)
  /** Why Claude wrote what it wrote, and what to double-check. */
  const [rationale, setRationale] = React.useState<string | null>(null)
  const textarea = React.useRef<HTMLTextAreaElement>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  /** A picked file waiting to be sent, with the draft as its caption. */
  const [attachment, setAttachment] = React.useState<Attachment | null>(null)

  const hasDraft = draft.trim().length > 0
  const busy = send.isPending || sendMedia.isPending || suggest.isPending
  const replyToId = replyTo?.id

  // Choosing a message to answer puts the cursor where the answer goes.
  React.useEffect(() => {
    if (replyToId) textarea.current?.focus()
  }, [replyToId])

  // Object URLs hold the file in memory until revoked.
  React.useEffect(
    () => () => {
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    },
    [attachment]
  )

  const attach = (file: File | undefined) => {
    if (!file) return
    const kind = outgoingMediaKind(file.type)
    if (!kind) {
      toast.error("Formato não suportado", {
        description:
          "Envie uma imagem (JPG, PNG ou WebP), um vídeo ou um áudio.",
      })
      return
    }
    setAttachment({
      file,
      kind,
      previewUrl:
        kind === "image" || kind === "video"
          ? URL.createObjectURL(file)
          : undefined,
    })
    textarea.current?.focus()
  }

  const submit = async () => {
    const text = draft.trim()
    if (!online) return
    if (attachment) {
      // Images and videos carry the text as caption; audio cannot, so it
      // follows apart.
      const caption = attachment.kind === "audio" ? undefined : text
      await sendMedia.mutateAsync({
        file: attachment.file,
        fileName: attachment.file.name,
        caption,
        replyTo: replyToId,
      })
      setAttachment(null)
      onClearReply()
      if (attachment.kind === "audio" && text) await send.mutateAsync(text)
    } else {
      if (!text) return
      await send.mutateAsync({ text, replyTo: replyToId })
      onClearReply()
    }
    setDraft("")
    setRationale(null)
  }

  const startRecording = async () => {
    try {
      await recorder.start()
    } catch {
      toast.error("Não foi possível usar o microfone", {
        description: "Verifique a permissão de microfone do navegador.",
      })
    }
  }

  const sendRecording = async () => {
    const recording = await recorder.stop()
    if (!recording || recording.seconds < 0.5) return
    await sendMedia.mutateAsync({
      file: recording.blob,
      fileName: "voz",
      voiceNote: true,
      replyTo: replyToId,
    })
    onClearReply()
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

      {replyTo ? (
        <div className="flex items-center gap-2">
          <Reply className="text-muted-foreground size-4 shrink-0" />
          <MessageQuote
            quote={replyTo}
            contactName={contactName}
            className="bg-muted flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearReply}
            aria-label="Cancelar resposta"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {attachment ? (
        <div className="bg-muted flex items-center gap-3 rounded-md p-2">
          {attachment.kind === "image" && attachment.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachment.previewUrl}
              alt="Imagem anexada"
              className="size-14 rounded object-cover"
            />
          ) : attachment.kind === "video" && attachment.previewUrl ? (
            <video
              src={attachment.previewUrl}
              muted
              preload="metadata"
              className="size-14 rounded bg-black object-cover"
              aria-label="Vídeo anexado"
            />
          ) : attachment.kind === "video" ? (
            <FileVideo className="text-muted-foreground size-8" />
          ) : (
            <FileAudio className="text-muted-foreground size-8" />
          )}
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-medium">{attachment.file.name}</p>
            <p className="text-muted-foreground">
              {attachment.kind === "audio"
                ? "O texto abaixo vai numa mensagem separada."
                : attachment.kind === "video"
                  ? "O texto abaixo vai como legenda. O vídeo é convertido antes do envio."
                  : "O texto abaixo vai como legenda."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAttachment(null)}
            disabled={sendMedia.isPending}
            aria-label="Remover anexo"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {recorder.recording ? (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={recorder.cancel}
            aria-label="Descartar gravação"
          >
            <Trash2 className="size-4" />
          </Button>
          <div className="flex flex-1 items-center gap-2 text-sm">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="tabular">{formatDuration(recorder.seconds)}</span>
            <span className="text-muted-foreground">Gravando...</span>
          </div>
          <Button onClick={sendRecording} aria-label="Enviar áudio">
            <Send className="size-4" />
            <span className="hidden sm:inline">Enviar</span>
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          {mediaEnabled ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={[
                  ...WHATSAPP_SENDABLE_IMAGE_TYPES,
                  "video/*",
                  "audio/*",
                ].join(",")}
                className="hidden"
                onChange={(event) => {
                  attach(event.target.files?.[0])
                  event.target.value = ""
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInput.current?.click()}
                disabled={!online || busy}
                aria-label="Anexar imagem, vídeo ou áudio"
                title="Anexar imagem, vídeo ou áudio"
              >
                <Paperclip className="size-4" />
              </Button>
            </>
          ) : null}
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
              if (event.key === "Escape" && replyTo) onClearReply()
            }}
            onPaste={(event) => {
              // A screenshot pasted into the box becomes an attachment.
              if (!mediaEnabled) return
              const file = Array.from(event.clipboardData.files).find(
                (item) => outgoingMediaKind(item.type) === "image"
              )
              if (file) {
                event.preventDefault()
                attach(file)
              }
            }}
            placeholder={
              !online
                ? "Conecte o WhatsApp para enviar mensagens"
                : attachment && attachment.kind !== "audio"
                  ? "Legenda (opcional)"
                  : "Digite uma mensagem..."
            }
            // Locked while Claude writes, so the suggestion never clobbers
            // something typed in the meantime.
            disabled={busy}
            rows={1}
            className="max-h-40 min-h-10 resize-none"
            aria-label="Mensagem"
          />
          <Button
            variant="outline"
            onClick={requestSuggestion}
            disabled={busy}
            aria-label={
              hasDraft ? "Melhorar texto com IA" : "Sugerir resposta com IA"
            }
            title={
              hasDraft ? "Melhorar texto com IA" : "Sugerir resposta com IA"
            }
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
          {/* With nothing to send, the button records, as in WhatsApp. */}
          {mediaEnabled && recorder.supported && !hasDraft && !attachment ? (
            <Button
              onClick={startRecording}
              disabled={!online || busy}
              aria-label="Gravar áudio"
              title="Gravar áudio"
            >
              {sendMedia.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mic className="size-4" />
              )}
              <span className="hidden sm:inline">Gravar</span>
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={!online || (!hasDraft && !attachment) || busy}
              aria-label="Enviar"
            >
              {send.isPending || sendMedia.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              <span className="hidden sm:inline">Enviar</span>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function ChatPanel({
  conversationId,
  online,
  initialDraft,
  onDeleted,
}: {
  conversationId: string
  online: boolean
  initialDraft?: string
  /** The conversation was deleted from its header menu. */
  onDeleted?: () => void
}) {
  const detail = useConversation(conversationId)
  const messages = useMessages(conversationId)
  const markRead = useMarkConversationRead()
  const sentinel = React.useRef<HTMLDivElement>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  // Tied to its conversation, so switching chats never keeps a stale reply.
  const [reply, setReply] = React.useState<{
    conversationId: string
    message: WhatsAppMessageDTO
  } | null>(null)
  const replyTo =
    reply?.conversationId === conversationId ? reply.message : null
  const clearReply = React.useCallback(() => setReply(null), [])
  const startReply = React.useCallback(
    (message: WhatsAppMessageDTO) => setReply({ conversationId, message }),
    [conversationId]
  )

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

  const contactName = detail.data?.conversation.title ?? "Contato"

  /** Scrolls to a quoted message and flashes it, like WhatsApp does. */
  const jumpTo = (whatsappMessageId: string) => {
    const target = scroller.current?.querySelector<HTMLElement>(
      `[data-wa-id="${CSS.escape(whatsappMessageId)}"]`
    )
    if (!target) {
      toast.info("Mensagem original não carregada", {
        description:
          "Role a conversa para cima para carregar mensagens mais antigas.",
      })
      return
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" })
    target.classList.add("ring-2", "ring-amber-400")
    setTimeout(() => target.classList.remove("ring-2", "ring-amber-400"), 1500)
  }

  // Newest first, as the API returns them; the column-reverse container
  // shows them bottom-up and keeps the scroll pinned to the latest message.
  const items = messages.data?.pages.flatMap((page) => page.items) ?? []
  const rows: React.ReactNode[] = []
  items.forEach((message, index) => {
    rows.push(
      <MessageBubble
        key={message.id}
        message={message}
        contactName={contactName}
        onReply={online ? startReply : undefined}
        onJumpTo={jumpTo}
      />
    )
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
          <>
            <ContactAvatar
              conversationId={conversation.id}
              name={conversation.title}
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{conversation.title}</p>
              {conversation.phone ? (
                <p className="text-muted-foreground text-xs">
                  {formatWhatsAppPhone(conversation.phone)}
                </p>
              ) : null}
            </div>
            <ConversationActions
              conversationId={conversationId}
              title={conversation.title}
              onDeleted={onDeleted}
            />
          </>
        ) : (
          <Skeleton className="h-10 w-48" />
        )}
      </div>

      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col-reverse gap-1.5 overflow-y-auto p-4"
      >
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
        replyTo={replyTo}
        contactName={contactName}
        onClearReply={clearReply}
      />
    </div>
  )
}
