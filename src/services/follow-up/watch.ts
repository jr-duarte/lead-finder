import {
  answeredSince,
  AWAITING_FOLLOW_UP_STATUSES,
  noReplyAt,
  UNSENT_FOLLOW_UP_STATUSES,
  wroteSince,
  type ConversationMessage,
  type FollowUp,
  type FollowUpStatus,
} from "@/domain/follow-up"
import { PIPELINE_STAGE_LABELS } from "@/domain/pipeline"
import { businessRepository } from "@/repositories/business.repository"
import { followUpRepository } from "@/repositories/follow-up.repository"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"
import { whatsappMessageRepository } from "@/repositories/whatsapp-message.repository"

/**
 * Keeps follow-ups in step with what happens on WhatsApp and on the board:
 * an answer, a message typed by hand or a card moved cancels one not sent
 * yet; an answer, or three days of silence, settles one already sent.
 * Reads repositories only, so the WhatsApp session can call it after every
 * batch without importing the sender.
 */

const HISTORY_LIMIT = 50

export const LEFT_CONTACTED_REASON = "O lead saiu de Contatado."
export const WROTE_AGAIN_REASON = "Você mandou outra mensagem para o lead."
export const ANSWERED_REASON = "O lead respondeu antes do follow-up."

export type FollowUpVerdict = { status: FollowUpStatus; reason?: string } | null

async function messagesOf(
  conversationId: string
): Promise<ConversationMessage[]> {
  return whatsappMessageRepository.recent(conversationId, HISTORY_LIMIT)
}

/**
 * What a follow-up not sent yet should become, or null to leave it as is.
 * Also the last check right before generating and before sending.
 */
export async function unsentVerdict(
  followUp: FollowUp
): Promise<FollowUpVerdict> {
  const business = await businessRepository.findById(followUp.businessId)
  const messages = await messagesOf(followUp.conversationId)

  if (answeredSince(messages, followUp.anchorAt)) {
    return { status: "REPLIED", reason: ANSWERED_REASON }
  }
  if (business?.pipeline?.stage !== "CONTACTED") {
    return { status: "CANCELLED", reason: LEFT_CONTACTED_REASON }
  }
  if (wroteSince(messages, followUp.anchorAt)) {
    return { status: "CANCELLED", reason: WROTE_AGAIN_REASON }
  }
  return null
}

/** What a sent follow-up should become, or null to leave it as is. */
async function sentVerdict(
  followUp: FollowUp,
  now: Date
): Promise<FollowUpVerdict> {
  const sentAt = followUp.sentAt ?? followUp.updatedAt
  const messages = await messagesOf(followUp.conversationId)
  if (answeredSince(messages, sentAt)) return { status: "REPLIED" }

  const business = await businessRepository.findById(followUp.businessId)
  const stage = business?.pipeline?.stage
  if (stage === "LOST") return { status: "LOST" }
  if (stage !== "CONTACTED") {
    return {
      status: "CLOSED",
      reason: stage
        ? `O lead foi movido para "${PIPELINE_STAGE_LABELS[stage]}".`
        : "O lead saiu do funil.",
    }
  }
  if (followUp.status === "SENT" && now >= noReplyAt(sentAt)) {
    return { status: "NO_REPLY" }
  }
  return null
}

/** Applies the verdict; true when the follow-up changed. */
async function settle(followUp: FollowUp, now: Date): Promise<boolean> {
  const unsent = UNSENT_FOLLOW_UP_STATUSES.includes(followUp.status)
  const awaiting = AWAITING_FOLLOW_UP_STATUSES.includes(followUp.status)
  if (!unsent && !awaiting) return false

  const verdict = unsent
    ? await unsentVerdict(followUp)
    : await sentVerdict(followUp, now)
  if (!verdict) return false
  return followUpRepository.transition(followUp.id, [followUp.status], {
    status: verdict.status,
    reason: verdict.reason,
  })
}

export const followUpWatch = {
  /** Re-checks the follow-ups of leads whose conversations just changed. */
  async check(conversationIds: string[], now = new Date()): Promise<number> {
    const businessIds = new Set<string>()
    for (const id of new Set(conversationIds)) {
      const conversation = await whatsappConversationRepository.findById(id)
      if (conversation?.businessId) businessIds.add(conversation.businessId)
    }
    if (businessIds.size === 0) return 0

    let changed = 0
    for (const followUp of await followUpRepository.listByBusinesses([
      ...businessIds,
    ])) {
      if (await settle(followUp, now)) changed += 1
    }
    return changed
  },

  /** Re-checks every open follow-up: cards moved, three days gone by. */
  async sweep(now = new Date()): Promise<number> {
    const open = await followUpRepository.listByStatus([
      ...UNSENT_FOLLOW_UP_STATUSES,
      ...AWAITING_FOLLOW_UP_STATUSES,
    ])
    let changed = 0
    for (const followUp of open) {
      if (await settle(followUp, now)) changed += 1
    }
    return changed
  },
}
