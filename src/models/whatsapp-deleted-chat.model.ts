import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

/**
 * A chat the user deleted from the CRM. Messages up to `deletedAt` are not
 * imported again by later syncs; anything newer brings the chat back.
 */
const whatsappDeletedChatSchema = new Schema(
  {
    /** Phone jid or LID; a person may get one entry for each. */
    chatJid: { type: String, required: true, unique: true },
    deletedAt: { type: Date, required: true },
  },
  { collection: "whatsapp_deleted_chats" }
)

export type WhatsAppDeletedChatDocument = InferSchemaType<
  typeof whatsappDeletedChatSchema
>

export const WhatsAppDeletedChatModel: Model<WhatsAppDeletedChatDocument> =
  (models.WhatsAppDeletedChat as Model<WhatsAppDeletedChatDocument>) ??
  model<WhatsAppDeletedChatDocument>(
    "WhatsAppDeletedChat",
    whatsappDeletedChatSchema
  )
