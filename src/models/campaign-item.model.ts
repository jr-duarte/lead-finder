import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

import { CAMPAIGN_ITEM_STATUS } from "@/domain/campaign"

/** One lead inside a campaign, with the message it will receive. */
const campaignItemSchema = new Schema(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    businessName: { type: String, required: true },
    message: { type: String, maxlength: 4096 },
    status: {
      type: String,
      enum: CAMPAIGN_ITEM_STATUS,
      default: "PENDING",
    },
    reason: String,
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "WhatsAppConversation",
    },
    sentAt: { type: Date, index: true },
    /** Send order inside the campaign. */
    position: { type: Number, required: true },
  },
  { timestamps: true, collection: "campaign_items" }
)

// A lead appears at most once per campaign.
campaignItemSchema.index({ campaignId: 1, businessId: 1 }, { unique: true })
// The send queue: next approved item by position.
campaignItemSchema.index({ campaignId: 1, status: 1, position: 1 })

export type CampaignItemDocument = InferSchemaType<typeof campaignItemSchema>

export const CampaignItemModel: Model<CampaignItemDocument> =
  (models.CampaignItem as Model<CampaignItemDocument>) ??
  model<CampaignItemDocument>("CampaignItem", campaignItemSchema)
