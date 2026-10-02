"use client"

import Link from "next/link"
import { ExternalLink, Loader2, MessageCircle } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ChatPanel } from "@/components/whatsapp/chat-panel"
import {
  isWhatsAppOnline,
  leadWhatsAppCandidates,
  type WhatsAppStatus,
} from "@/domain/whatsapp"
import type { BusinessDTO } from "@/types/api"
import {
  useLeadConversations,
  useStartConversation,
  useWhatsAppEvents,
  useWhatsAppStatus,
  whatsappInboxHref,
} from "@/viewmodels/use-whatsapp"

/** The lead's WhatsApp conversation, right on its page. */
export function LeadWhatsAppPanel({ business }: { business: BusinessDTO }) {
  useWhatsAppEvents()
  const status = useWhatsAppStatus()
  const conversations = useLeadConversations(business.id)
  const start = useStartConversation()

  const online = isWhatsAppOnline(
    (status.data?.status ?? "DISCONNECTED") as WhatsAppStatus
  )
  const hasPhone = leadWhatsAppCandidates(business).length > 0
  const conversation = conversations.data?.items[0]

  if (conversations.isError) return <ErrorState error={conversations.error} />
  if (conversations.isPending) return <Skeleton className="h-96 w-full" />

  if (conversation) {
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex justify-end border-b px-3 py-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={whatsappInboxHref(conversation.id)}>
              <ExternalLink className="size-4" />
              Abrir na caixa de entrada
            </Link>
          </Button>
        </div>
        <div className="flex h-[560px] flex-col">
          <ChatPanel conversationId={conversation.id} online={online} />
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <EmptyState
        icon={MessageCircle}
        title="Nenhuma conversa no WhatsApp"
        description={
          !hasPhone
            ? "Este lead não tem telefone cadastrado. Edite o lead para informar um número."
            : online
              ? "Inicie a conversa pelo CRM. O número é verificado no WhatsApp antes."
              : "Conecte o WhatsApp para iniciar a conversa com este lead."
        }
        action={
          !hasPhone ? null : online ? (
            <Button
              onClick={() => start.mutate(business.id)}
              disabled={start.isPending}
            >
              {start.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MessageCircle className="size-4" />
              )}
              Iniciar conversa
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/whatsapp">Conectar WhatsApp</Link>
            </Button>
          )
        }
      />
    </Card>
  )
}
