import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

const whatsappConversationSchema = new Schema(
  {
    whatsappChatId: { type: String, required: true, unique: true },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: "WhatsAppContact",
      required: true,
      index: true,
    },
    /** The lead this conversation is about. */
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      index: true,
      default: null,
    },
    /**
     * "manual" means the user decided — including unlinking — so automatic
     * phone matching must not override it.
     */
    leadLinkSource: { type: String, enum: ["auto", "manual"] },
    /** Denormalized from the contact so listing and search need no join. */
    title: { type: String, required: true, trim: true },
    phone: String,
    lastMessage: String,
    lastMessageAt: Date,
    lastMessageFromMe: Boolean,
    unreadCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "whatsapp_conversations" }
)

// The inbox lists the most recent conversations first.
whatsappConversationSchema.index({ lastMessageAt: -1 })

export type WhatsAppConversationDocument = InferSchemaType<
  typeof whatsappConversationSchema
>

export const WhatsAppConversationModel: Model<WhatsAppConversationDocument> =
  (models.WhatsAppConversation as Model<WhatsAppConversationDocument>) ??
  model<WhatsAppConversationDocument>(
    "WhatsAppConversation",
    whatsappConversationSchema
  )
