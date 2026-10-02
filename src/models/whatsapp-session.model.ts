import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

import { WHATSAPP_STATUS } from "@/domain/whatsapp"

const syncStatsSchema = new Schema(
  {
    startedAt: { type: Date, required: true },
    finishedAt: Date,
    conversations: { type: Number, default: 0 },
    newMessages: { type: Number, default: 0 },
  },
  { _id: false }
)

/**
 * Metadata of a WhatsApp session plus its sync bookmark. Credentials never
 * land here: Baileys keeps them in the local session folder.
 */
const whatsappSessionSchema = new Schema(
  {
    sessionName: { type: String, required: true, unique: true },
    status: { type: String, enum: WHATSAPP_STATUS, default: "DISCONNECTED" },
    phoneNumber: String,
    pushName: String,
    lastConnectedAt: Date,
    /** Start of the last sync that finished; the next one overlaps it. */
    lastSyncAt: Date,
    lastSync: { type: syncStatsSchema, default: undefined },
    lastSyncError: String,
  },
  { timestamps: true, collection: "whatsapp_sessions" }
)

export type WhatsAppSessionDocument = InferSchemaType<
  typeof whatsappSessionSchema
>

export const WhatsAppSessionModel: Model<WhatsAppSessionDocument> =
  (models.WhatsAppSession as Model<WhatsAppSessionDocument>) ??
  model<WhatsAppSessionDocument>("WhatsAppSession", whatsappSessionSchema)
