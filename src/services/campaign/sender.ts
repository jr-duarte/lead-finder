import {
  isWithinWindow,
  jitteredIntervalMs,
  nextWindowStart,
  startOfDay,
  startOfNextDay,
  type Campaign,
  type CampaignItem,
} from "@/domain/campaign"
import { getEnv } from "@/lib/env"
import { campaignRepository } from "@/repositories/campaign.repository"
import { settingsRepository } from "@/repositories/settings.repository"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"
import { whatsappMessageRepository } from "@/repositories/whatsapp-message.repository"
import { stripSignature } from "@/services/approach.service"
import { checkLeads } from "@/services/campaign/eligibility"
import {
  WhatsAppActionError,
  whatsappSessionService,
} from "@/services/whatsapp/session.service"

/**
 * The send queue. A tick runs every TICK_MS while the CRM is open and sends
 * at most one message, so nothing ever goes out in a burst — not even after
 * the CRM was closed for hours: the next send is always counted from the
 * last one, not from a timetable set in advance.
 */

const TICK_MS = 30_000
/** Paused after this many failures in a row: something is wrong. */
const MAX_CONSECUTIVE_FAILURES = 3
/** How long to wait when WhatsApp's new-chat quota runs out. */
const QUOTA_RETRY_MS = 60 * 60 * 1000

type SenderState = {
  timer?: ReturnType<typeof setInterval>
  /** Passes run one after another, never side by side. */
  chain: Promise<void>
}

const globalForSender = globalThis as typeof globalThis & {
  __leadFinderCampaignSender?: SenderState
}
const state: SenderState = globalForSender.__leadFinderCampaignSender ?? {
  chain: Promise.resolve(),
}
globalForSender.__leadFinderCampaignSender = state

/** Test seam: deterministic jitter. */
let random: () => number = Math.random
export function setSenderRandom(next: () => number): void {
  random = next
}

function log(message: string) {
  console.info(`[campanha] ${message}`)
}

function settings() {
  const env = getEnv()
  return {
    dailyLimit: env.WHATSAPP_CAMPAIGN_DAILY_LIMIT,
    jitterPercent: env.WHATSAPP_CAMPAIGN_JITTER_PERCENT,
  }
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date)
}

async function waitUntil(campaign: Campaign, when: Date, reason?: string) {
  await campaignRepository.update(campaign.id, {
    nextSendAt: when,
    waitReason: reason,
  })
}

async function pauseRunning(campaignIds: string[], reason: string) {
  for (const id of campaignIds) {
    await campaignRepository.transition(id, ["RUNNING"], {
      status: "PAUSED",
      pauseReason: reason,
      nextSendAt: undefined,
    })
  }
  log(`campanhas pausadas: ${reason}`)
}

/**
 * Last check right before sending: the lead may have been contacted since it
 * was queued (by hand, or it wrote first).
 */
async function stillEligible(item: CampaignItem): Promise<string | null> {
  const [check] = await checkLeads([item.businessId], {
    ignoreCampaignId: item.campaignId,
  })
  return check?.reason ?? null
}

async function sendItem(
  campaign: Campaign,
  item: CampaignItem,
  now: Date
): Promise<void> {
  const skipReason = await stillEligible(item)
  if (skipReason) {
    await campaignRepository.updateItem(item.id, {
      status: "SKIPPED",
      reason: skipReason,
    })
    // Nothing was sent, so the next lead may go right away.
    return
  }

  const nextSendAt = new Date(
    now.getTime() +
      jitteredIntervalMs(
        campaign.intervalMinutes,
        settings().jitterPercent,
        random
      )
  )

  try {
    const conversation = await whatsappSessionService.startConversation(
      item.businessId
    )
    // Last line of defense: nobody signs WhatsApp messages.
    const { sellerName } = await settingsRepository.getSeller()
    const message = stripSignature(item.message ?? "", sellerName)
    await whatsappSessionService.sendText(conversation.id, message)
    await campaignRepository.updateItem(item.id, {
      status: "SENT",
      sentAt: now,
      conversationId: conversation.id,
      reason: undefined,
    })
    await campaignRepository.update(campaign.id, {
      lastSentAt: now,
      nextSendAt,
      consecutiveFailures: 0,
      waitReason: undefined,
    })
    log(
      `"${campaign.name}": mensagem enviada para ${item.businessName}; próxima ${formatTime(nextSendAt)}`
    )
  } catch (error) {
    if (error instanceof WhatsAppActionError && error.status === 409) {
      // Disconnected mid-way: not the lead's fault, try again later.
      await campaignRepository.updateItem(item.id, { status: "APPROVED" })
      return
    }
    if (error instanceof WhatsAppActionError && error.status === 422) {
      // No WhatsApp or no phone: the lead is out, the queue goes on.
      await campaignRepository.updateItem(item.id, {
        status: "INELIGIBLE",
        reason: error.message,
      })
      return
    }

    const failures = campaign.consecutiveFailures + 1
    const reason =
      error instanceof Error ? error.message : "Falha desconhecida no envio."
    await campaignRepository.updateItem(item.id, { status: "FAILED", reason })
    await campaignRepository.update(campaign.id, {
      consecutiveFailures: failures,
      nextSendAt,
    })
    log(
      `"${campaign.name}": falha ao enviar para ${item.businessName}: ${reason}`
    )

    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      await pauseRunning(
        [campaign.id],
        `${failures} falhas seguidas no envio. Confira a conexão do WhatsApp e retome.`
      )
    }
  }
}

/** One pass of the queue: at most one message across all campaigns. */
/**
 * Runs a pass after any pass already running. Two passes never overlap, so a
 * campaign's next slot is always computed from the latest send.
 */
export function tick(now?: Date): Promise<void> {
  const run = state.chain.then(() => pass(now ?? new Date()))
  state.chain = run.catch(() => undefined)
  return run
}

async function pass(now: Date): Promise<void> {
  try {
    if (!whatsappSessionService.isOnline()) return

    const running = await campaignRepository.listByStatus(["RUNNING"])
    const due = running.filter(
      (campaign) => !campaign.nextSendAt || campaign.nextSendAt <= now
    )
    if (due.length === 0) return

    // The daily limit protects the account, so it counts every campaign.
    const { dailyLimit } = settings()
    const sentToday = await campaignRepository.countSentSince(startOfDay(now))
    if (sentToday >= dailyLimit) {
      for (const campaign of running) {
        const tomorrow = nextWindowStart(startOfNextDay(now), campaign.window)
        if (tomorrow) {
          await waitUntil(
            campaign,
            tomorrow,
            `Limite diário de ${dailyLimit} primeiros contatos atingido. Continua ${formatTime(tomorrow)}.`
          )
        }
      }
      return
    }

    const outreach = await whatsappSessionService.outreachStatus()
    if (outreach?.restricted) {
      const until = outreach.restrictedUntil
        ? ` até ${formatTime(outreach.restrictedUntil)}`
        : ""
      await pauseRunning(
        running.map((campaign) => campaign.id),
        `O WhatsApp está limitando novos contatos desta conta${until}. Não retome antes disso.`
      )
      return
    }
    if (outreach?.newChatsRemaining === 0) {
      const retry = new Date(now.getTime() + QUOTA_RETRY_MS)
      for (const campaign of running) {
        await waitUntil(
          campaign,
          retry,
          "A cota de novas conversas do WhatsApp acabou por enquanto. Tentando de novo em 1 hora."
        )
      }
      return
    }

    for (const campaign of due) {
      if (campaign.startAt && campaign.startAt > now) {
        await waitUntil(campaign, campaign.startAt)
        continue
      }

      if (!isWithinWindow(now, campaign.window)) {
        const opens = nextWindowStart(now, campaign.window)
        if (opens) {
          await waitUntil(
            campaign,
            opens,
            `Fora do horário de envio. Retoma ${formatTime(opens)}.`
          )
        }
        continue
      }

      const item = await campaignRepository.claimNext(
        { campaignId: campaign.id },
        "APPROVED",
        "SENDING"
      )
      if (!item) {
        const waiting = await campaignRepository.countItems(campaign.id, [
          "PENDING",
          "GENERATING",
          "READY",
        ])
        if (waiting === 0) {
          await campaignRepository.transition(campaign.id, ["RUNNING"], {
            status: "DONE",
            nextSendAt: undefined,
            waitReason: undefined,
          })
          log(`"${campaign.name}" concluída`)
        } else {
          await campaignRepository.update(campaign.id, {
            waitReason: `${waiting} lead(s) aguardando geração ou aprovação.`,
          })
        }
        continue
      }

      await sendItem(campaign, item, now)
      // One message per tick, whatever the number of campaigns.
      return
    }
  } catch (error) {
    console.error("[campanha] falha na fila de envio", error)
  }
}

/**
 * After a restart, an item left in SENDING may or may not have gone out.
 * If the message is in the conversation it counts as sent; otherwise it is
 * flagged for the user instead of being resent: two identical first
 * messages are worse than one missing.
 */
export async function recoverInterruptedSends(): Promise<void> {
  const stuck = await campaignRepository.itemsWithStatus("SENDING")
  for (const item of stuck) {
    const [conversation] = await whatsappConversationRepository.listByBusiness(
      item.businessId
    )
    const recent = conversation
      ? await whatsappMessageRepository.recent(conversation.id, 20)
      : []
    const sent = recent.find(
      (message) => message.fromMe && message.body === item.message
    )
    if (sent && conversation) {
      await campaignRepository.updateItem(item.id, {
        status: "SENT",
        sentAt: sent.timestamp,
        conversationId: conversation.id,
      })
    } else {
      await campaignRepository.updateItem(item.id, {
        status: "FAILED",
        reason:
          "O envio foi interrompido. Confira a conversa antes de tentar de novo.",
      })
    }
  }
}

export const campaignSender = {
  /** Starts the periodic tick once per process. */
  start(): void {
    if (state.timer) return
    state.timer = setInterval(() => void tick(), TICK_MS)
    // Never keeps a test or a script alive on its own.
    state.timer.unref?.()
  },

  /** Runs a tick right away, e.g. after starting or resuming a campaign. */
  poke(): void {
    void tick()
  },
}
