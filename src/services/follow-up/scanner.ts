import { DEFAULT_SEND_WINDOW, timeZoneForCountries } from "@/domain/campaign"
import { conversationState, followUpDueAt } from "@/domain/follow-up"
import { leadCountry } from "@/domain/phone"
import { getEnv } from "@/lib/env"
import { campaignRepository } from "@/repositories/campaign.repository"
import { followUpRepository } from "@/repositories/follow-up.repository"
import { pipelineRepository } from "@/repositories/pipeline.repository"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"
import { whatsappMessageRepository } from "@/repositories/whatsapp-message.repository"
import { autoReplyClassifier } from "@/services/follow-up/auto-reply"

/**
 * Finds the leads due for a follow-up: in "Contatado", our message was the
 * last thing anyone typed (automatic replies do not count), three days ago
 * or more, and no follow-up yet. Old leads count too.
 */

const HISTORY_LIMIT = 50

export async function scanForFollowUps(
  now = new Date(),
  onlyBusinessIds?: string[]
): Promise<number> {
  const contacted = (await pipelineRepository.inStage("CONTACTED")).filter(
    (business) => !onlyBusinessIds || onlyBusinessIds.includes(business.id)
  )
  if (contacted.length === 0) return 0
  const taken = await followUpRepository.businessesWithFollowUp(
    contacted.map((business) => business.id)
  )

  let created = 0
  for (const business of contacted) {
    if (taken.has(business.id)) continue
    const [conversation] = await whatsappConversationRepository.listByBusiness(
      business.id
    )
    if (!conversation) continue

    // Replies stored before automatic ones were told apart get a verdict.
    await autoReplyClassifier.classifyLatest(conversation.id)
    const messages = await whatsappMessageRepository.recent(
      conversation.id,
      HISTORY_LIMIT
    )
    const state = conversationState(messages)
    if (!state.lastOutgoingAt || state.answered || state.undecided) continue
    if (now < followUpDueAt(state.lastOutgoingAt)) continue

    // The pace and hours of the campaign that made the first contact; the
    // campaign defaults otherwise, in the lead's local time.
    const campaign = await campaignRepository.sentCampaignOf(business.id)
    const country = leadCountry(business)
    const followUp = await followUpRepository.create({
      businessId: business.id,
      businessName: business.name,
      conversationId: conversation.id,
      campaignId: campaign?.id,
      campaignName: campaign?.name,
      anchorAt: state.lastOutgoingAt,
      window: campaign?.window ?? DEFAULT_SEND_WINDOW,
      timeZone:
        campaign?.timeZone ?? timeZoneForCountries(country ? [country] : []),
      intervalMinutes:
        campaign?.intervalMinutes ??
        getEnv().WHATSAPP_CAMPAIGN_DEFAULT_INTERVAL_MIN,
      autoReplies: state.autoReplies,
    })
    if (followUp) created += 1
  }
  return created
}
