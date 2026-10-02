import { hasOffer } from "@/domain/approach"
import {
  CANCELLED_ITEM_REASON,
  canReopenCampaign,
  DEFAULT_SEND_WINDOW,
  timeZoneForCountries,
  FINAL_ITEM_STATUSES,
  isCampaignOpen,
  OPEN_CAMPAIGN_STATUSES,
  type Campaign,
  type CampaignItem,
  type CampaignItemStatus,
  type SendWindow,
} from "@/domain/campaign"
import { getEnv } from "@/lib/env"
import { campaignRepository } from "@/repositories/campaign.repository"
import { settingsRepository } from "@/repositories/settings.repository"
import { businessRepository } from "@/repositories/business.repository"
import { stripDashes, stripSignature } from "@/services/approach.service"
import { checkLeads, type LeadCheck } from "@/services/campaign/eligibility"
import { campaignGenerator } from "@/services/campaign/generator"
import { campaignMessageService } from "@/services/campaign/message"
import {
  campaignSender,
  recoverInterruptedSends,
} from "@/services/campaign/sender"

/** A request the user can fix; the route answers with `status`. */
export class CampaignError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "CampaignError"
  }
}

export type AddLeadsResult = {
  added: number
  /** Leads left out, with the reason, so the UI can explain. */
  rejected: LeadCheck[]
}

export type ReopenResult = {
  campaign: Campaign
  /** Leads released by the cancel that are back in the campaign. */
  restored: number
  /** Leads that could not come back, with the reason. */
  blocked: { businessName: string; reason: string }[]
}

export type CampaignDetail = {
  campaign: Campaign
  items: CampaignItem[]
  dailyLimit: number
}

async function requireCampaign(id: string): Promise<Campaign> {
  const campaign = await campaignRepository.findById(id)
  if (!campaign) throw new CampaignError("Campanha não encontrada.", 404)
  return campaign
}

async function requireOpen(id: string): Promise<Campaign> {
  const campaign = await requireCampaign(id)
  if (!isCampaignOpen(campaign.status)) {
    throw new CampaignError("Esta campanha já foi encerrada.", 409)
  }
  return campaign
}

async function requireItem(
  campaignId: string,
  itemId: string
): Promise<CampaignItem> {
  const item = await campaignRepository.findItem(campaignId, itemId)
  if (!item) throw new CampaignError("Lead não encontrado na campanha.", 404)
  return item
}

/** Approaches are written from the offer; without it they all read alike. */
async function requireOffer(): Promise<void> {
  if (!hasOffer(await settingsRepository.getSeller())) {
    throw new CampaignError(
      "Descreva o que você oferece em Configurações antes de criar campanhas.",
      422
    )
  }
}

function validateWindow(window: SendWindow): SendWindow {
  const days = [...new Set(window.days)].filter((day) => day >= 0 && day <= 6)
  if (days.length === 0) {
    throw new CampaignError("Escolha ao menos um dia da semana.", 422)
  }
  if (window.endHour <= window.startHour) {
    throw new CampaignError(
      "O horário final precisa ser depois do inicial.",
      422
    )
  }
  return {
    days: days.sort(),
    startHour: window.startHour,
    endHour: window.endHour,
  }
}

/**
 * Removes signatures from messages saved before they were banned: lead
 * approaches and campaign messages not sent yet. Only rewrites what changes,
 * so running it on every start is cheap and harmless.
 */
async function cleanSavedSignatures(): Promise<number> {
  const { sellerName } = await settingsRepository.getSeller()
  if (!sellerName?.trim()) return 0
  let cleaned = 0

  for (const approach of await businessRepository.approachMessages()) {
    const whatsapp =
      approach.whatsapp && stripSignature(approach.whatsapp, sellerName)
    const followUp =
      approach.followUp && stripSignature(approach.followUp, sellerName)
    if (whatsapp !== approach.whatsapp || followUp !== approach.followUp) {
      await businessRepository.update(approach.id, {
        ...(whatsapp !== approach.whatsapp
          ? { "approach.whatsapp": whatsapp }
          : {}),
        ...(followUp !== approach.followUp
          ? { "approach.followUp": followUp }
          : {}),
      })
      cleaned += 1
    }
  }

  const pending: CampaignItemStatus[] = [
    "PENDING",
    "READY",
    "APPROVED",
    "FAILED",
  ]
  for (const campaign of await campaignRepository.listByStatus(
    OPEN_CAMPAIGN_STATUSES
  )) {
    for (const item of await campaignRepository.listItems(campaign.id)) {
      if (!item.message || !pending.includes(item.status)) continue
      const message = stripSignature(item.message, sellerName)
      if (message !== item.message) {
        await campaignRepository.updateItem(item.id, { message })
        cleaned += 1
      }
    }
  }
  return cleaned
}

export const campaignService = {
  list(): Promise<Campaign[]> {
    return campaignRepository.list()
  },

  async detail(id: string): Promise<CampaignDetail> {
    const campaign = await requireCampaign(id)
    const items = await campaignRepository.listItems(id)
    return {
      campaign,
      items,
      dailyLimit: getEnv().WHATSAPP_CAMPAIGN_DAILY_LIMIT,
    }
  },

  /** Lists the open campaigns a lead could be added to. */
  async open(): Promise<Campaign[]> {
    const all = await campaignRepository.list()
    return all.filter((campaign) => isCampaignOpen(campaign.status))
  },

  /**
   * Creates a campaign with the eligible leads and starts writing their
   * messages right away. Refused when none of the leads can take part.
   */
  async create(input: {
    name: string
    brief?: string
    businessIds: string[]
    intervalMinutes?: number
    window?: SendWindow
    timeZone?: string
    startAt?: Date
  }): Promise<{ campaign: Campaign } & AddLeadsResult> {
    await requireOffer()
    const checks = await checkLeads(input.businessIds)
    const eligible = checks.filter((check) => !check.reason)
    const rejected = checks.filter((check) => check.reason)

    if (input.businessIds.length > 0 && eligible.length === 0) {
      throw new CampaignError(
        "Nenhum dos leads selecionados pode entrar na campanha: todos já foram contatados, estão em outra campanha ou não têm telefone.",
        422
      )
    }

    const created = await campaignRepository.create({
      name: input.name,
      brief: input.brief || undefined,
      intervalMinutes:
        input.intervalMinutes ??
        getEnv().WHATSAPP_CAMPAIGN_DEFAULT_INTERVAL_MIN,
      window: validateWindow(input.window ?? DEFAULT_SEND_WINDOW),
      // The leads' local time by default: a window of 9h to 18h means their
      // business hours, not Brasília's.
      timeZone:
        input.timeZone ??
        timeZoneForCountries(
          eligible.flatMap((check) => (check.country ? [check.country] : []))
        ),
      startAt: input.startAt,
    })
    const added = await campaignRepository.addItems(
      created.id,
      eligible.map((check) => ({
        businessId: check.businessId,
        businessName: check.name,
      }))
    )

    if (added === 0) {
      // An empty campaign has nothing to generate.
      await campaignRepository.update(created.id, { status: "REVIEW" })
    } else {
      campaignGenerator.kick()
    }

    return {
      campaign: (await campaignRepository.findById(created.id)) ?? created,
      added,
      rejected,
    }
  },

  /** Adds leads to an open campaign; new ones get their message written. */
  async addLeads(id: string, businessIds: string[]): Promise<AddLeadsResult> {
    await requireOpen(id)
    await requireOffer()
    const checks = await checkLeads(businessIds)
    const eligible = checks.filter((check) => !check.reason)
    const added = await campaignRepository.addItems(
      id,
      eligible.map((check) => ({
        businessId: check.businessId,
        businessName: check.name,
      }))
    )
    if (added > 0) campaignGenerator.kick()
    return { added, rejected: checks.filter((check) => check.reason) }
  },

  async updateSettings(
    id: string,
    patch: {
      name?: string
      brief?: string
      intervalMinutes?: number
      window?: SendWindow
      timeZone?: string
      startAt?: Date | null
    }
  ): Promise<Campaign> {
    await requireOpen(id)
    await campaignRepository.update(id, {
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.brief !== undefined ? { brief: patch.brief || undefined } : {}),
      ...(patch.intervalMinutes
        ? { intervalMinutes: patch.intervalMinutes }
        : {}),
      ...(patch.window ? { window: validateWindow(patch.window) } : {}),
      ...(patch.timeZone ? { timeZone: patch.timeZone } : {}),
      ...(patch.startAt !== undefined
        ? { startAt: patch.startAt ?? undefined }
        : {}),
    })
    campaignSender.poke()
    return requireCampaign(id)
  },

  /** "Aprovar todas": every ready message goes to the send queue. */
  async approveAll(id: string): Promise<number> {
    await requireOpen(id)
    const approved = await campaignRepository.transitionItems(
      id,
      ["READY"],
      "APPROVED"
    )
    campaignSender.poke()
    return approved
  },

  /**
   * Starts sending, or resumes a paused campaign. A resume keeps the pace:
   * the next message waits a full interval after the last one, so pausing
   * and resuming never sends two in a row. Waits for the daily limit or the
   * send window are not kept; the queue works them out again.
   */
  async start(id: string): Promise<Campaign> {
    const campaign = await requireOpen(id)
    if (campaign.status === "RUNNING") return campaign

    const now = new Date()
    const afterLast = campaign.lastSentAt
      ? new Date(
          campaign.lastSentAt.getTime() + campaign.intervalMinutes * 60_000
        )
      : now
    const startsAt = new Date(
      Math.max(
        now.getTime(),
        afterLast.getTime(),
        campaign.startAt?.getTime() ?? 0
      )
    )
    await campaignRepository.transition(
      id,
      ["GENERATING", "REVIEW", "PAUSED"],
      {
        status: "RUNNING",
        nextSendAt: startsAt,
        pauseReason: undefined,
        waitReason: undefined,
        consecutiveFailures: 0,
      }
    )
    campaignSender.poke()
    return requireCampaign(id)
  },

  async pause(id: string): Promise<Campaign> {
    await requireOpen(id)
    await campaignRepository.transition(id, ["RUNNING"], {
      status: "PAUSED",
      pauseReason: "Pausada por você.",
      nextSendAt: undefined,
    })
    return requireCampaign(id)
  },

  /** Ends the campaign; leads not yet contacted are released. */
  async cancel(id: string): Promise<Campaign> {
    await requireOpen(id)
    await campaignRepository.transition(
      id,
      ["GENERATING", "REVIEW", "RUNNING", "PAUSED"],
      { status: "CANCELLED", nextSendAt: undefined }
    )
    const open: CampaignItemStatus[] = ["PENDING", "READY", "APPROVED"]
    await campaignRepository.transitionItems(
      id,
      open,
      "SKIPPED",
      CANCELLED_ITEM_REASON
    )
    return requireCampaign(id)
  },

  /**
   * Brings a finished or cancelled campaign back, paused: nothing is sent
   * until the user starts it again. Leads the cancel released come back for
   * review, unless they were contacted or joined another campaign since.
   * Leads skipped by hand stay skipped, and sent messages stay sent.
   */
  async reopen(id: string): Promise<ReopenResult> {
    const campaign = await requireCampaign(id)
    if (!canReopenCampaign(campaign.status)) {
      throw new CampaignError("Esta campanha já está aberta.", 409)
    }

    const reopened = await campaignRepository.transition(
      id,
      ["DONE", "CANCELLED"],
      {
        status: "PAUSED",
        pauseReason: "Reaberta. Revise os leads e clique em Iniciar.",
        waitReason: undefined,
        nextSendAt: undefined,
        consecutiveFailures: 0,
      }
    )
    if (!reopened) {
      throw new CampaignError("Esta campanha já está aberta.", 409)
    }

    const released = (await campaignRepository.listItems(id)).filter(
      (item) =>
        item.status === "SKIPPED" && item.reason === CANCELLED_ITEM_REASON
    )
    // Skipped items do not count as "in a campaign": any campaign a check
    // names is another one.
    const checks = new Map(
      (await checkLeads(released.map((item) => item.businessId))).map(
        (check) => [check.businessId, check]
      )
    )

    let restored = 0
    let needsMessage = false
    const blocked: ReopenResult["blocked"] = []
    for (const item of released) {
      const reason = checks.get(item.businessId)?.reason
      if (reason) {
        blocked.push({ businessName: item.businessName, reason })
        await campaignRepository.updateItem(item.id, {
          reason: `Não voltou ao reabrir: ${reason}`,
        })
        continue
      }
      await campaignRepository.updateItem(item.id, {
        status: item.message ? "READY" : "PENDING",
        reason: undefined,
      })
      if (!item.message) needsMessage = true
      restored += 1
    }
    if (needsMessage) campaignGenerator.kick()

    return { campaign: await requireCampaign(id), restored, blocked }
  },

  /** Edits, approves or skips one lead before it is sent. */
  async updateItem(
    id: string,
    itemId: string,
    patch: { message?: string; status?: "APPROVED" | "SKIPPED" }
  ): Promise<CampaignItem> {
    await requireOpen(id)
    const item = await requireItem(id, itemId)
    if (FINAL_ITEM_STATUSES.includes(item.status) && item.status !== "FAILED") {
      throw new CampaignError("Este lead já foi processado.", 409)
    }
    if (item.status === "SENDING" || item.status === "GENERATING") {
      throw new CampaignError("Aguarde: este lead está sendo processado.", 409)
    }
    if (patch.status === "APPROVED" && !(patch.message ?? item.message)) {
      throw new CampaignError("Este lead ainda não tem mensagem.", 409)
    }

    await campaignRepository.updateItem(itemId, {
      ...(patch.message !== undefined
        ? { message: stripDashes(patch.message.trim()) }
        : {}),
      ...(patch.status ? { status: patch.status, reason: undefined } : {}),
    })
    if (patch.status === "APPROVED") campaignSender.poke()
    return requireItem(id, itemId)
  },

  /**
   * Writes a fresh message for one lead with Claude, from the campaign's
   * current angle. Waits for it, like the approach button; the item goes
   * back to review afterwards.
   */
  async regenerate(id: string, itemId: string): Promise<CampaignItem> {
    const campaign = await requireOpen(id)
    const item = await requireItem(id, itemId)
    if (!["READY", "APPROVED", "FAILED"].includes(item.status)) {
      throw new CampaignError("Este lead não pode ser regenerado agora.", 409)
    }
    const message = await campaignMessageService.write(
      item.businessId,
      campaign
    )
    if (!message) {
      throw new CampaignError("O Claude não escreveu a mensagem.", 502)
    }
    await campaignRepository.updateItem(itemId, {
      message,
      status: "READY",
      reason: undefined,
    })
    return requireItem(id, itemId)
  },

  /**
   * After the angle changes: every message not sent yet (waiting for
   * approval or in the send queue) is written again in the background and
   * comes back for review. Sent messages are never touched.
   */
  async rewriteUnsent(id: string): Promise<number> {
    await requireOpen(id)
    const rewritten = await campaignRepository.transitionItems(
      id,
      ["READY", "APPROVED"],
      "PENDING"
    )
    if (rewritten > 0) {
      // Back to "generating" so the page follows the progress; it returns
      // to review when the queue is written. Running or paused campaigns
      // keep their state.
      await campaignRepository.transition(id, ["REVIEW"], {
        status: "GENERATING",
      })
      campaignGenerator.kick()
    }
    return rewritten
  },

  /**
   * Undoes a skip. The lead is checked again first: if it was contacted or
   * joined another campaign meanwhile, it stays out and the reason is shown.
   * It comes back for review, never straight into the send queue.
   */
  async restoreItem(id: string, itemId: string): Promise<CampaignItem> {
    await requireOpen(id)
    const item = await requireItem(id, itemId)
    if (item.status !== "SKIPPED") {
      throw new CampaignError("Só leads pulados podem voltar.", 409)
    }

    // Skipped items are not counted as "in a campaign", so any campaign
    // named here is another one.
    const [check] = await checkLeads([item.businessId])
    if (check?.reason) {
      throw new CampaignError(`Não dá para voltar: ${check.reason}`, 409)
    }

    await campaignRepository.updateItem(itemId, {
      status: item.message ? "READY" : "PENDING",
      reason: undefined,
    })
    if (!item.message) campaignGenerator.kick()
    return requireItem(id, itemId)
  },

  /** Failed generations go back to the queue to be written again. */
  async retryFailed(id: string): Promise<number> {
    await requireOpen(id)
    const items = await campaignRepository.listItems(id)
    let retried = 0
    for (const item of items) {
      if (item.status !== "FAILED") continue
      // Failed sends keep their message and only need re-approval.
      await campaignRepository.updateItem(item.id, {
        status: item.message ? "READY" : "PENDING",
        reason: undefined,
      })
      retried += 1
    }
    campaignGenerator.kick()
    return retried
  },

  /**
   * Runs once when the server starts: resumes interrupted work and starts
   * the send queue.
   */
  async boot(): Promise<void> {
    const cleaned = await cleanSavedSignatures()
    if (cleaned > 0) {
      console.info(
        `[campanha] assinatura removida de ${cleaned} mensagem(ns) salvas`
      )
    }
    await recoverInterruptedSends()
    await campaignGenerator.recover()
    campaignGenerator.kick()
    campaignSender.start()
  },
}
