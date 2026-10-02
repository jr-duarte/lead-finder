import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

import {
  WHATSAPP_MEDIA_STATUS,
  WHATSAPP_MESSAGE_STATUS,
  WHATSAPP_MESSAGE_TYPES,
} from "@/domain/whatsapp"

const mediaSchema = new Schema(
  {
    mimeType: { type: String, required: true },
    status: { type: String, enum: WHATSAPP_MEDIA_STATUS, required: true },
    /** Object key in the media bucket; set once the file is stored. */
    storageKey: String,
    size: Number,
    seconds: Number,
    voiceNote: Boolean,
  },
  { _id: false }
)

const whatsappMessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "WhatsAppConversation",
      required: true,
    },
    /**
     * Id WhatsApp assigns to the message. The unique index is what makes every
     * sync idempotent: replaying the same message is a no-op.
     */
    whatsappMessageId: { type: String, required: true, unique: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    body: { type: String, default: "" },
    type: { type: String, enum: WHATSAPP_MESSAGE_TYPES, default: "text" },
    timestamp: { type: Date, required: true, index: true },
    fromMe: { type: Boolean, required: true },
    status: { type: String, enum: WHATSAPP_MESSAGE_STATUS },
    media: { type: mediaSchema, default: undefined },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "whatsapp_messages",
  }
)

// History is paginated per conversation, newest first.
whatsappMessageSchema.index({ conversationId: 1, timestamp: -1 })

export type WhatsAppMessageDocument = InferSchemaType<
  typeof whatsappMessageSchema
>

export const WhatsAppMessageModel: Model<WhatsAppMessageDocument> =
  (models.WhatsAppMessage as Model<WhatsAppMessageDocument>) ??
  model<WhatsAppMessageDocument>("WhatsAppMessage", whatsappMessageSchema)
