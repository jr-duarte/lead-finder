import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

const whatsappContactSchema = new Schema(
  {
    /** Canonical jid: phone-number jid when known, LID otherwise. */
    whatsappId: { type: String, required: true, unique: true },
    lid: { type: String, index: true, sparse: true },
    /** Digits only, with country code. */
    phone: { type: String, index: true },
    name: { type: String, trim: true },
    pushName: { type: String, trim: true },
    profilePicture: String,
  },
  { timestamps: true, collection: "whatsapp_contacts" }
)

export type WhatsAppContactDocument = InferSchemaType<
  typeof whatsappContactSchema
>

export const WhatsAppContactModel: Model<WhatsAppContactDocument> =
  (models.WhatsAppContact as Model<WhatsAppContactDocument>) ??
  model<WhatsAppContactDocument>("WhatsAppContact", whatsappContactSchema)
