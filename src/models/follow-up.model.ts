import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

import { CAMPAIGN_TIME_ZONE } from "@/domain/campaign"
import { FOLLOW_UP_STATUS } from "@/domain/follow-up"

const windowSchema = new Schema(
  {
    days: { type: [Number], default: [1, 2, 3, 4, 5] },
    startHour: { type: Number, min: 0, max: 23, default: 9 },
    endHour: { type: Number, min: 1, max: 24, default: 18 },
  },
  { _id: false }
)

/** The one extra message a lead in "Contatado" gets when it does not answer. */
const followUpSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    businessName: { type: String, required: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "WhatsAppConversation",
      required: true,
    },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign" },
    campaignName: String,
    anchorAt: { type: Date, required: true },
    message: { type: String, maxlength: 4096 },
    status: {
      type: String,
      enum: FOLLOW_UP_STATUS,
      default: "PENDING",
      index: true,
    },
    reason: String,
    window: { type: windowSchema, default: () => ({}) },
    timeZone: { type: String, default: CAMPAIGN_TIME_ZONE },
    intervalMinutes: { type: Number, required: true, min: 2 },
    autoReplies: { type: [String], default: [] },
    sentAt: { type: Date, index: true },
  },
  { timestamps: true, collection: "follow_ups" }
)

// One follow-up per lead, ever: "só mais uma mensagem".
followUpSchema.index({ businessId: 1 }, { unique: true })

export type FollowUpDocument = InferSchemaType<typeof followUpSchema>

export const FollowUpModel: Model<FollowUpDocument> =
  (models.FollowUp as Model<FollowUpDocument>) ??
  model<FollowUpDocument>("FollowUp", followUpSchema)
