import type { PipelineStage } from "@/domain/pipeline"
import {
  quotePreview,
  WHATSAPP_QUOTE_MAX_LENGTH,
  type WhatsAppContact,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from "@/domain/whatsapp"
import { businessRepository } from "@/repositories/business.repository"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"
import { whatsappMessageRepository } from "@/repositories/whatsapp-message.repository"
import { emitWhatsAppEvent } from "@/services/whatsapp/events"

export type LeadSummary = {
  id: string
  name: string
  phone?: string
  category?: string
  stage?: PipelineStage
}

export type ConversationDetail = {
  conversation: WhatsAppConversation
  contact: WhatsAppContact | null
  lead: LeadSummary | null
}

/**
 * WhatsApp's copy of a quote may be stale or say little about who wrote it;
 * when the original is stored, its own author and text are used instead.
 */
async function resolveQuotes(
  conversationId: string,
  messages: WhatsAppMessage[]
): Promise<WhatsAppMessage[]> {
  const ids = [
    ...new Set(
      messages.flatMap((message) =>
        message.quoted ? [message.quoted.whatsappMessageId] : []
      )
    ),
  ]
  const originals = new Map(
    (
      await whatsappMessageRepository.findManyByWhatsAppIds(conversationId, ids)
    ).map((original) => [original.whatsappMessageId, original])
  )
  return messages.map((message) => {
    const original = message.quoted
      ? originals.get(message.quoted.whatsappMessageId)
      : undefined
    if (!message.quoted || !original) return message
    return {
      ...message,
      quoted: {
        whatsappMessageId: original.whatsappMessageId,
        fromMe: original.fromMe,
        type: original.type,
        body: original.body.slice(0, WHATSAPP_QUOTE_MAX_LENGTH),
      },
    }
  })
}

async function leadSummary(businessId?: string): Promise<LeadSummary | null> {
  if (!businessId) return null
  const business = await businessRepository.findById(businessId)
  if (!business) return null
  return {
    id: business.id,
    name: business.name,
    phone: business.phone,
    category: business.category,
    stage: business.pipeline?.stage,
  }
}

export const whatsappConversationService = {
  list(params: {
    search?: string
    businessId?: string
    page: number
    pageSize: number
  }) {
    return whatsappConversationRepository.list(params)
  },

  async detail(id: string): Promise<ConversationDetail | null> {
    const conversation = await whatsappConversationRepository.findById(id)
    if (!conversation) return null

    const [contact, lead] = await Promise.all([
      whatsappConversationRepository.findContactById(conversation.contactId),
      leadSummary(conversation.businessId),
    ])
    return { conversation, contact, lead }
  },

  /** One page of history, newest first, plus the cursor for the next one. */
  async messages(
    id: string,
    { before, limit }: { before?: string; limit: number }
  ): Promise<{ items: WhatsAppMessage[]; nextCursor: string | null }> {
    // One extra row tells whether an older page exists.
    const page = await whatsappMessageRepository.listByConversation(id, {
      beforeId: before,
      limit: limit + 1,
    })
    const hasMore = page.length > limit
    const items = await resolveQuotes(id, hasMore ? page.slice(0, limit) : page)
    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    }
  },

  async markRead(id: string): Promise<WhatsAppConversation | null> {
    const conversation = await whatsappConversationRepository.markRead(id)
    if (conversation) {
      emitWhatsAppEvent({ type: "conversations", conversationIds: [id] })
    }
    return conversation
  },

  /**
   * Links (or, with null, unlinks) a lead. A manual choice is final: phone
   * matching will not relink a conversation the user unlinked.
   */
  async linkLead(
    id: string,
    businessId: string | null
  ): Promise<ConversationDetail | null | "lead-not-found"> {
    if (businessId) {
      const business = await businessRepository.findById(businessId)
      if (!business) return "lead-not-found"
    }
    const updated = await whatsappConversationRepository.setLead(
      id,
      businessId,
      "manual"
    )
    if (!updated) return null
    emitWhatsAppEvent({ type: "conversations", conversationIds: [id] })
    return this.detail(id)
  },

  /**
   * The conversation as plain text, oldest first: the input a future
   * "suggest a reply" or "summarize" feature would hand to the AI.
   */
  async context(id: string, limit = 40): Promise<string | null> {
    const detail = await this.detail(id)
    if (!detail) return null

    const messages = await resolveQuotes(
      id,
      await whatsappMessageRepository.recent(id, limit)
    )
    const name = detail.conversation.title
    const lines = messages.map((message) => {
      const author = message.fromMe ? "Você" : name
      // A reply only makes sense next to what it answers.
      const reply = message.quoted
        ? ` (respondendo a ${message.quoted.fromMe ? "Você" : name}: "${quotePreview(message.quoted).slice(0, 120)}")`
        : ""
      return `${author}${reply}: ${message.body || `[${message.type}]`}`
    })
    const header = detail.lead
      ? `Lead: ${detail.lead.name}${detail.lead.category ? ` (${detail.lead.category})` : ""}`
      : `Contato: ${name}`
    return [header, "", ...lines].join("\n")
  },
}
