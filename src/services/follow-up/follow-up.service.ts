import {
  onlyAutomatedReplies,
  type FollowUp,
  type FollowUpCounts,
  type FollowUpStatus,
} from "@/domain/follow-up"
import { followUpRepository } from "@/repositories/follow-up.repository"
import { noteRepository } from "@/repositories/note.repository"
import { pipelineRepository } from "@/repositories/pipeline.repository"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"
import { whatsappMessageRepository } from "@/repositories/whatsapp-message.repository"
import { stripDashes } from "@/services/approach.service"
import { autoReplyClassifier } from "@/services/follow-up/auto-reply"
import { followUpGenerator } from "@/services/follow-up/generator"
import { followUpMessageService } from "@/services/follow-up/message"
import { scanForFollowUps } from "@/services/follow-up/scanner"
import {
  followUpSender,
  recoverInterruptedFollowUps,
} from "@/services/follow-up/sender"
import { followUpWatch, unsentVerdict } from "@/services/follow-up/watch"
import { emitWhatsAppEvent } from "@/services/whatsapp/events"

/** A request the user can fix; the route answers with `status`. */
export class FollowUpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "FollowUpError"
  }
}

/** A lead that went to "Respondeu" on automatic replies only. */
export type AutoReplyReviewItem = {
  businessId: string
  businessName: string
  conversationId: string
  autoReplies: string[]
}

/** How often leads are scanned and open follow-ups re-checked. */
const MAINTENANCE_MS = 10 * 60 * 1000
const HISTORY_LIMIT = 50

const EDITABLE: FollowUpStatus[] = ["READY", "APPROVED", "FAILED"]
const SKIPPABLE: FollowUpStatus[] = ["PENDING", "READY", "APPROVED", "FAILED"]

const globalForService = globalThis as typeof globalThis & {
  __leadFinderFollowUpMaintenance?: {
    timer?: ReturnType<typeof setInterval>
    running?: Promise<number>
  }
}
const maintenance = globalForService.__leadFinderFollowUpMaintenance ?? {}
globalForService.__leadFinderFollowUpMaintenance = maintenance

function log(message: string) {
  console.info(`[follow-up] ${message}`)
}

async function requireFollowUp(id: string): Promise<FollowUp> {
  const followUp = await followUpRepository.findById(id)
  if (!followUp) throw new FollowUpError("Follow-up não encontrado.", 404)
  return followUp
}

/** Re-checks open follow-ups, then looks for leads that became due. */
async function runMaintenance(now = new Date()): Promise<number> {
  await followUpWatch.sweep(now)
  const created = await scanForFollowUps(now)
  if (created > 0) {
    log(`${created} lead(s) entraram na fila de follow-up`)
    followUpGenerator.kick()
  }
  return created
}

/** One maintenance pass at a time, whoever asks for it. */
function maintain(now?: Date): Promise<number> {
  maintenance.running ??= runMaintenance(now).finally(() => {
    maintenance.running = undefined
  })
  return maintenance.running
}

/**
 * Gives a verdict to the replies of leads in "Respondeu", from our first
 * message on: the ones that only got automatic replies show up for review.
 */
async function classifyRepliedLeads(): Promise<void> {
  for (const business of await pipelineRepository.inStage("REPLIED")) {
    for (const conversation of await whatsappConversationRepository.listByBusiness(
      business.id
    )) {
      await autoReplyClassifier.classifyConversation(conversation.id)
    }
  }
}

export const followUpService = {
  async list(): Promise<{ followUps: FollowUp[]; counts: FollowUpCounts }> {
    const [followUps, counts] = await Promise.all([
      followUpRepository.list(),
      followUpRepository.counts(),
    ])
    return { followUps, counts }
  },

  /** Edits, approves or skips a follow-up before it is sent. */
  async update(
    id: string,
    patch: { message?: string; status?: "APPROVED" | "SKIPPED" }
  ): Promise<FollowUp> {
    const followUp = await requireFollowUp(id)
    const allowed = patch.status === "SKIPPED" ? SKIPPABLE : EDITABLE
    if (!allowed.includes(followUp.status)) {
      throw new FollowUpError(
        followUp.status === "GENERATING" || followUp.status === "SENDING"
          ? "Aguarde: este follow-up está sendo processado."
          : "Este follow-up não pode mais ser alterado.",
        409
      )
    }
    const message =
      patch.message !== undefined
        ? stripDashes(patch.message.trim())
        : followUp.message
    if (patch.status === "APPROVED" && !message) {
      throw new FollowUpError("Este follow-up ainda não tem mensagem.", 409)
    }

    const changed = await followUpRepository.transition(id, [followUp.status], {
      status: patch.status ?? followUp.status,
      ...(patch.message !== undefined ? { message } : {}),
      ...(patch.status ? { reason: undefined } : {}),
    })
    if (!changed) {
      throw new FollowUpError(
        "O follow-up mudou enquanto isso. Tente de novo.",
        409
      )
    }
    if (patch.status === "APPROVED") followUpSender.poke()
    return requireFollowUp(id)
  },

  /** Every message waiting for approval goes to the send queue. */
  async approveAll(): Promise<number> {
    const approved = await followUpRepository.transitionAll(
      ["READY"],
      "APPROVED"
    )
    followUpSender.poke()
    return approved
  },

  /** Writes a fresh message with Claude; it comes back for review. */
  async regenerate(id: string): Promise<FollowUp> {
    const followUp = await requireFollowUp(id)
    if (!EDITABLE.includes(followUp.status)) {
      throw new FollowUpError(
        "Este follow-up não pode ser regenerado agora.",
        409
      )
    }
    const verdict = await unsentVerdict(followUp)
    if (verdict) {
      await followUpRepository.transition(id, [followUp.status], verdict)
      throw new FollowUpError(
        verdict.reason ?? "Este follow-up não é mais necessário.",
        409
      )
    }
    const message = await followUpMessageService.write(followUp)
    if (!message) {
      throw new FollowUpError("O Claude não escreveu a mensagem.", 502)
    }
    await followUpRepository.transition(id, [followUp.status], {
      status: "READY",
      message,
      reason: undefined,
    })
    return requireFollowUp(id)
  },

  /** Undoes a skip; it comes back for review, never straight to the queue. */
  async restore(id: string): Promise<FollowUp> {
    const followUp = await requireFollowUp(id)
    if (followUp.status !== "SKIPPED") {
      throw new FollowUpError("Só follow-ups pulados podem voltar.", 409)
    }
    const verdict = await unsentVerdict(followUp)
    if (verdict) {
      throw new FollowUpError(
        `Não dá para voltar: ${verdict.reason ?? "o lead respondeu."}`,
        409
      )
    }
    await followUpRepository.transition(id, ["SKIPPED"], {
      status: followUp.message ? "READY" : "PENDING",
      reason: undefined,
    })
    if (!followUp.message) followUpGenerator.kick()
    return requireFollowUp(id)
  },

  /**
   * "Mover para Perdido": leads that did not answer the follow-up leave the
   * funnel as lost, with a note saying why.
   */
  async markLost(ids: string[]): Promise<number> {
    const businessIds: string[] = []
    for (const id of new Set(ids)) {
      const followUp = await followUpRepository.findById(id)
      if (!followUp || followUp.status !== "NO_REPLY") continue
      const changed = await followUpRepository.transition(id, ["NO_REPLY"], {
        status: "LOST",
      })
      if (!changed) continue
      await pipelineRepository.move(followUp.businessId, "LOST")
      await noteRepository.create(
        followUp.businessId,
        'Movido para "Perdido": não respondeu ao follow-up.'
      )
      businessIds.push(followUp.businessId)
    }
    if (businessIds.length > 0)
      emitWhatsAppEvent({ type: "leads", businessIds })
    return businessIds.length
  },

  /** Keeps an unanswered lead in "Contatado" and takes it off the list. */
  async keep(id: string): Promise<FollowUp> {
    const changed = await followUpRepository.transition(id, ["NO_REPLY"], {
      status: "CLOSED",
      reason: "Mantido em Contatado por você.",
    })
    if (!changed) {
      throw new FollowUpError("Este follow-up não está mais sem resposta.", 409)
    }
    return requireFollowUp(id)
  },

  /** Looks for due leads right away instead of waiting for the next pass. */
  scanNow(): Promise<number> {
    return maintain()
  },

  /**
   * Leads in "Respondeu" whose replies were all automatic. Nothing moves on
   * its own: the user confirms each one.
   */
  async autoReplyReview(): Promise<AutoReplyReviewItem[]> {
    const items: AutoReplyReviewItem[] = []
    for (const business of await pipelineRepository.inStage("REPLIED")) {
      const conversations = await whatsappConversationRepository.listByBusiness(
        business.id
      )
      const [conversation] = conversations
      if (!conversation) continue
      const messages = await whatsappMessageRepository.recent(
        conversation.id,
        HISTORY_LIMIT
      )
      const autoReplies = onlyAutomatedReplies(messages)
      if (!autoReplies) continue
      items.push({
        businessId: business.id,
        businessName: business.name,
        conversationId: conversation.id,
        autoReplies,
      })
    }
    return items
  },

  /**
   * Settles a lead from the review: back to "Contatado" (and into the
   * follow-up queue once due), or "it was a person after all".
   */
  async resolveAutoReply(
    businessId: string,
    action: "contacted" | "human"
  ): Promise<void> {
    const item = (await this.autoReplyReview()).find(
      (candidate) => candidate.businessId === businessId
    )
    if (!item) {
      throw new FollowUpError("Este lead não está mais na revisão.", 404)
    }

    if (action === "human") {
      await whatsappMessageRepository.markConversationHuman(item.conversationId)
      return
    }

    await pipelineRepository.move(businessId, "CONTACTED")
    await noteRepository.create(
      businessId,
      'Voltou para "Contatado": as respostas eram automáticas.'
    )
    emitWhatsAppEvent({ type: "leads", businessIds: [businessId] })
    const created = await scanForFollowUps(new Date(), [businessId])
    if (created > 0) followUpGenerator.kick()
  },

  /** Classifies the replies of leads in "Respondeu" again (background). */
  reviewAutoReplies(): void {
    void classifyRepliedLeads().catch((error) =>
      console.error("[follow-up] falha ao revisar respostas", error)
    )
  },

  /** A card moved on the board: its follow-up may no longer apply. */
  async onLeadsMoved(businessIds: string[]): Promise<void> {
    const conversations = await Promise.all(
      businessIds.map((id) => whatsappConversationRepository.listByBusiness(id))
    )
    await followUpWatch.check(conversations.flat().map((item) => item.id))
  },

  /**
   * Runs once when the server starts: resumes interrupted work, starts the
   * queues and the periodic scan.
   */
  async boot(): Promise<void> {
    await recoverInterruptedFollowUps()
    await followUpGenerator.recover()
    followUpGenerator.kick()
    autoReplyClassifier.kick()
    followUpSender.start()

    if (!maintenance.timer) {
      maintenance.timer = setInterval(() => {
        void maintain().catch((error) =>
          console.error("[follow-up] falha na verificação periódica", error)
        )
      }, MAINTENANCE_MS)
      maintenance.timer.unref?.()
    }
    await maintain()
    this.reviewAutoReplies()
  },

  /** Test seam: one maintenance pass at a given moment. */
  maintain,
}
