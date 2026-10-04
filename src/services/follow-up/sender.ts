import { isWithinWindow, jitteredIntervalMs } from "@/domain/campaign"
import type { FollowUp } from "@/domain/follow-up"
import { getEnv } from "@/lib/env"
import { followUpRepository } from "@/repositories/follow-up.repository"
import { settingsRepository } from "@/repositories/settings.repository"
import { whatsappMessageRepository } from "@/repositories/whatsapp-message.repository"
import { stripSignature } from "@/services/approach.service"
import { unsentVerdict } from "@/services/follow-up/watch"
import {
  WhatsAppActionError,
  whatsappSessionService,
} from "@/services/whatsapp/session.service"

/**
 * The follow-up send queue. Same rules as campaigns, except the daily limit:
 * only inside each follow-up's send window, one message per tick, and the
 * next one waits the interval (with jitter) after the last. Follow-ups go to
 * conversations that already exist, so WhatsApp's new-chat quota does not
 * apply either.
 */

type SenderState = {
  timer?: ReturnType<typeof setInterval>
  chain: Promise<void>
  /** No follow-up goes out before this; undefined until read from the DB. */
  nextSendAt?: Date | null
}

const globalForSender = globalThis as typeof globalThis & {
  __leadFinderFollowUpSender?: SenderState
}
const state: SenderState = globalForSender.__leadFinderFollowUpSender ?? {
  chain: Promise.resolve(),
}
globalForSender.__leadFinderFollowUpSender = state

const TICK_MS = 30_000

/** Test seam: deterministic jitter. */
let random: () => number = Math.random
export function setFollowUpSenderRandom(next: () => number): void {
  random = next
}

/** Test seam: forget the pace, as after a restart. */
export function resetFollowUpPace(): void {
  state.nextSendAt = undefined
}

function log(message: string) {
  console.info(`[follow-up] ${message}`)
}

function nextAfter(now: Date, followUp: FollowUp): Date {
  return new Date(
    now.getTime() +
      jitteredIntervalMs(
        followUp.intervalMinutes,
        getEnv().WHATSAPP_CAMPAIGN_JITTER_PERCENT,
        random
      )
  )
}

async function send(followUp: FollowUp, now: Date): Promise<void> {
  const verdict = await unsentVerdict(followUp)
  if (verdict) {
    // Nothing was sent, so the next one may go right away.
    await followUpRepository.transition(followUp.id, ["SENDING"], verdict)
    return
  }

  try {
    // Last line of defense: nobody signs WhatsApp messages.
    const { sellerName } = await settingsRepository.getSeller()
    const message = stripSignature(followUp.message ?? "", sellerName)
    await whatsappSessionService.sendText(followUp.conversationId, message)
    await followUpRepository.transition(followUp.id, ["SENDING"], {
      status: "SENT",
      sentAt: now,
      reason: undefined,
    })
    state.nextSendAt = nextAfter(now, followUp)
    log(`follow-up enviado para ${followUp.businessName}`)
  } catch (error) {
    if (error instanceof WhatsAppActionError && error.status === 409) {
      // Disconnected mid-way: try again later.
      await followUpRepository.transition(followUp.id, ["SENDING"], {
        status: "APPROVED",
      })
      return
    }
    const reason =
      error instanceof Error ? error.message : "Falha desconhecida no envio."
    await followUpRepository.transition(followUp.id, ["SENDING"], {
      status: "FAILED",
      reason,
    })
    state.nextSendAt = nextAfter(now, followUp)
    log(`falha ao enviar follow-up para ${followUp.businessName}: ${reason}`)
  }
}

async function pass(now: Date): Promise<void> {
  try {
    if (!whatsappSessionService.isOnline()) return

    if (state.nextSendAt === undefined) {
      // After a restart the pace counts from the last follow-up sent.
      const last = await followUpRepository.lastSentAt()
      state.nextSendAt = last
        ? new Date(
            last.getTime() +
              getEnv().WHATSAPP_CAMPAIGN_DEFAULT_INTERVAL_MIN * 60_000
          )
        : null
    }
    if (state.nextSendAt && now < state.nextSendAt) return

    const approved = await followUpRepository.listByStatus(["APPROVED"])
    const next = approved.find((followUp) =>
      isWithinWindow(now, followUp.window, followUp.timeZone)
    )
    if (!next) return
    const claimed = await followUpRepository.transition(next.id, ["APPROVED"], {
      status: "SENDING",
    })
    if (!claimed) return
    await send(next, now)
  } catch (error) {
    console.error("[follow-up] falha na fila de envio", error)
  }
}

/** Runs a pass after any pass already running; two never overlap. */
export function followUpTick(now?: Date): Promise<void> {
  const run = state.chain.then(() => pass(now ?? new Date()))
  state.chain = run.catch(() => undefined)
  return run
}

/**
 * After a restart, a follow-up left in SENDING may or may not have gone
 * out: sent if the message is in the conversation, otherwise flagged for
 * the user instead of sent twice.
 */
export async function recoverInterruptedFollowUps(): Promise<void> {
  for (const followUp of await followUpRepository.listByStatus(["SENDING"])) {
    const recent = await whatsappMessageRepository.recent(
      followUp.conversationId,
      20
    )
    const sent = recent.find(
      (message) => message.fromMe && message.body === followUp.message
    )
    await followUpRepository.transition(
      followUp.id,
      ["SENDING"],
      sent
        ? { status: "SENT", sentAt: sent.timestamp }
        : {
            status: "FAILED",
            reason:
              "O envio foi interrompido. Confira a conversa antes de tentar de novo.",
          }
    )
  }
}

export const followUpSender = {
  /** Starts the periodic tick once per process. */
  start(): void {
    if (state.timer) return
    state.timer = setInterval(() => void followUpTick(), TICK_MS)
    state.timer.unref?.()
  },

  /** Runs a tick right away, e.g. after approving. */
  poke(): void {
    void followUpTick()
  },
}
