import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

import { CAMPAIGN_STATUS } from "@/domain/campaign"

const windowSchema = new Schema(
  {
    days: { type: [Number], default: [1, 2, 3, 4, 5] },
    startHour: { type: Number, min: 0, max: 23, default: 9 },
    endHour: { type: Number, min: 1, max: 24, default: 18 },
  },
  { _id: false }
)

const campaignSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: CAMPAIGN_STATUS,
      default: "GENERATING",
      index: true,
    },
    intervalMinutes: { type: Number, required: true, min: 2 },
    window: { type: windowSchema, default: () => ({}) },
    startAt: Date,
    nextSendAt: Date,
    lastSentAt: Date,
    pauseReason: String,
    waitReason: String,
    consecutiveFailures: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "campaigns" }
)

campaignSchema.index({ createdAt: -1 })

export type CampaignDocument = InferSchemaType<typeof campaignSchema>

export const CampaignModel: Model<CampaignDocument> =
  (models.Campaign as Model<CampaignDocument>) ??
  model<CampaignDocument>("Campaign", campaignSchema)
