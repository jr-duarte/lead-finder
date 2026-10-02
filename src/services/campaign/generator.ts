import { OPEN_CAMPAIGN_STATUSES, type CampaignItem } from "@/domain/campaign"
import { campaignRepository } from "@/repositories/campaign.repository"
import { checkLeads } from "@/services/campaign/eligibility"
import { campaignMessageService } from "@/services/campaign/message"
import { whatsappSessionService } from "@/services/whatsapp/session.service"

/**
 * Writes the first message of each queued lead, one at a time: every run
 * goes through the local Claude Code CLI and takes a while. Survives a page
 * reload; a server restart resumes from what was left.
 */

const globalForGenerator = globalThis as typeof globalThis & {
  __leadFinderCampaignGenerator?: { running: boolean }
}
const state = globalForGenerator.__leadFinderCampaignGenerator ?? {
  running: false,
}
globalForGenerator.__leadFinderCampaignGenerator = state

function log(message: string) {
  console.info(`[campanha] ${message}`)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Writes one lead's message and checks its number, or says why not. */
async function generateItem(item: CampaignItem): Promise<void> {
  const [check] = await checkLeads([item.businessId], {
    ignoreCampaignId: item.campaignId,
  })
  if (check?.reason) {
    await campaignRepository.updateItem(item.id, {
      status: "INELIGIBLE",
      reason: check.reason,
    })
    return
  }

  // Always written for this campaign, even when the lead has a saved
  // approach: the campaign's angle is what sets the pitch.
  const campaign = await campaignRepository.findById(item.campaignId)
  if (!campaign) return
  let message: string
  try {
    message = await campaignMessageService.write(item.businessId, campaign)
  } catch (error) {
    await campaignRepository.updateItem(item.id, {
      status: "FAILED",
      reason: errorMessage(error, "Não foi possível gerar a mensagem."),
    })
    return
  }
  if (!message) {
    await campaignRepository.updateItem(item.id, {
      status: "FAILED",
      reason: "O Claude não escreveu a mensagem.",
    })
    return
  }

  // Checked now when possible, so leads without WhatsApp never reach the
  // queue. Offline, the check happens again right before sending.
  try {
    const jid = await whatsappSessionService.verifyLeadNumber(item.businessId)
    if (jid === null) {
      await campaignRepository.updateItem(item.id, {
        status: "INELIGIBLE",
        reason: "Nenhum telefone deste lead tem WhatsApp.",
        message,
      })
      return
    }
  } catch {
    // Verification failed (network): the send-time check covers it.
  }

  await campaignRepository.updateItem(item.id, {
    status: "READY",
    message,
    reason: undefined,
  })
}

/** Campaigns that were generating and have nothing left go to review. */
async function settleCampaigns(): Promise<void> {
  const generating = await campaignRepository.listByStatus(["GENERATING"])
  for (const campaign of generating) {
    const left = await campaignRepository.countItems(campaign.id, [
      "PENDING",
      "GENERATING",
    ])
    if (left === 0) {
      await campaignRepository.transition(campaign.id, ["GENERATING"], {
        status: "REVIEW",
      })
      log(`"${campaign.name}" pronta para revisão`)
    }
  }
}

async function run(): Promise<void> {
  for (;;) {
    const open = await campaignRepository.listByStatus(OPEN_CAMPAIGN_STATUSES)
    if (open.length === 0) break
    const item = await campaignRepository.claimNext(
      { campaignIds: open.map((campaign) => campaign.id) },
      "PENDING",
      "GENERATING"
    )
    if (!item) break

    log(`gerando mensagem para ${item.businessName}`)
    try {
      await generateItem(item)
    } catch (error) {
      console.error("[campanha] falha ao gerar item", error)
      await campaignRepository.updateItem(item.id, {
        status: "FAILED",
        reason: errorMessage(error, "Erro inesperado ao gerar a mensagem."),
      })
    }
  }
  await settleCampaigns()
}

export const campaignGenerator = {
  /** Starts the generator unless it is already running; never blocks. */
  kick(): void {
    if (state.running) return
    state.running = true
    void run()
      .catch((error) => console.error("[campanha] geração interrompida", error))
      .finally(() => {
        state.running = false
      })
  },

  /** After a restart: items caught mid-generation go back to the queue. */
  async recover(): Promise<void> {
    const stuck = await campaignRepository.itemsWithStatus("GENERATING")
    for (const item of stuck) {
      await campaignRepository.updateItem(item.id, { status: "PENDING" })
    }
  },

  isRunning(): boolean {
    return state.running
  },
}
