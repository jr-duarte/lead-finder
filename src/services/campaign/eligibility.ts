import { leadWhatsAppCandidates } from "@/domain/whatsapp"
import { ineligibilityReason } from "@/domain/campaign"
import type { Business } from "@/domain/business"
import { businessRepository } from "@/repositories/business.repository"
import { campaignRepository } from "@/repositories/campaign.repository"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"

export type LeadCheck = {
  businessId: string
  name: string
  /** Null when the lead may join; otherwise why not. */
  reason: string | null
}

/** True when the lead already exchanged messages on WhatsApp. */
async function hasConversation(businessId: string): Promise<boolean> {
  const conversations =
    await whatsappConversationRepository.listByBusiness(businessId)
  return conversations.some((conversation) =>
    Boolean(conversation.lastMessageAt)
  )
}

/**
 * Checks which leads may enter a campaign: only leads never contacted.
 * `ignoreCampaignId` skips the lead's own campaign when re-checking at send
 * time.
 */
export async function checkLeads(
  businessIds: string[],
  options: { ignoreCampaignId?: string } = {}
): Promise<LeadCheck[]> {
  const unique = [...new Set(businessIds)]
  const [businesses, openCampaigns] = await Promise.all([
    businessRepository.findManyByIds(unique),
    options.ignoreCampaignId
      ? Promise.resolve(new Map<string, string>())
      : campaignRepository.openCampaignsOf(unique),
  ])
  const byId = new Map<string, Business>(
    businesses.map((business) => [business.id, business])
  )

  const checks: LeadCheck[] = []
  for (const businessId of unique) {
    const business = byId.get(businessId)
    if (!business) {
      checks.push({ businessId, name: "?", reason: "Lead não encontrado." })
      continue
    }
    checks.push({
      businessId,
      name: business.name,
      reason: ineligibilityReason({
        stage: business.pipeline?.stage ?? null,
        hasPhone: leadWhatsAppCandidates(business).length > 0,
        hasConversation: await hasConversation(businessId),
        openCampaignName: openCampaigns.get(businessId),
      }),
    })
  }
  return checks
}
