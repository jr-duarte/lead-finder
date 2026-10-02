import { Types } from "mongoose"

import {
  contactDisplayName,
  WHATSAPP_MEDIA_PLACEHOLDERS,
  type LeadLinkSource,
  type WhatsAppContact,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from "@/domain/whatsapp"
import type { Paginated } from "@/repositories/business.repository"
import type { WaContact } from "@/lib/whatsapp/client"
import { connectToDatabase } from "@/lib/mongoose"
import {
  WhatsAppContactModel,
  type WhatsAppContactDocument,
} from "@/models/whatsapp-contact.model"
import {
  WhatsAppConversationModel,
  type WhatsAppConversationDocument,
} from "@/models/whatsapp-conversation.model"
import { WhatsAppDeletedChatModel } from "@/models/whatsapp-deleted-chat.model"
import { whatsappMessageRepository } from "@/repositories/whatsapp-message.repository"

type RawContact = WhatsAppContactDocument & {
  _id: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

type RawConversation = WhatsAppConversationDocument & {
  _id: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

function toContact(raw: RawContact): WhatsAppContact {
  return {
    id: String(raw._id),
    whatsappId: raw.whatsappId,
    lid: raw.lid ?? undefined,
    phone: raw.phone ?? undefined,
    name: raw.name ?? undefined,
    pushName: raw.pushName ?? undefined,
    profilePicture: raw.profilePicture ?? undefined,
    createdAt: raw.createdAt ?? new Date(),
    updatedAt: raw.updatedAt ?? new Date(),
  }
}

function toConversation(raw: RawConversation): WhatsAppConversation {
  return {
    id: String(raw._id),
    contactId: String(raw.contactId),
    businessId: raw.businessId ? String(raw.businessId) : undefined,
    leadLinkSource: (raw.leadLinkSource ?? undefined) as
      LeadLinkSource | undefined,
    whatsappChatId: raw.whatsappChatId,
    title: raw.title,
    phone: raw.phone ?? undefined,
    lastMessage: raw.lastMessage ?? undefined,
    lastMessageAt: raw.lastMessageAt ?? undefined,
    lastMessageFromMe: raw.lastMessageFromMe ?? undefined,
    unreadCount: raw.unreadCount ?? 0,
    createdAt: raw.createdAt ?? new Date(),
    updatedAt: raw.updatedAt ?? new Date(),
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Text shown in the inbox for a message, with media placeholders. */
export function messagePreview(
  message: Pick<WhatsAppMessage, "body" | "type">
): string {
  const body = message.body.trim()
  if (body) return body.slice(0, 280)
  return WHATSAPP_MEDIA_PLACEHOLDERS[message.type] || ""
}

export const whatsappConversationRepository = {
  /**
   * Creates or refreshes a contact. Only fields WhatsApp actually sent are
   * written, so a partial update never erases a known name.
   */
  async upsertContact(contact: WaContact): Promise<WhatsAppContact> {
    await connectToDatabase()

    const $set: Record<string, string> = {}
    if (contact.name) $set.name = contact.name
    if (contact.pushName) $set.pushName = contact.pushName
    if (contact.phone) $set.phone = contact.phone
    if (contact.lid) $set.lid = contact.lid

    const raw = await WhatsAppContactModel.findOneAndUpdate(
      { whatsappId: contact.jid },
      { $set, $setOnInsert: { whatsappId: contact.jid } },
      { upsert: true, returnDocument: "after" }
    )
      .lean<RawContact>()
      .exec()

    return toContact(raw as RawContact)
  },

  /**
   * Bulk version for history sync, which may carry the whole address book.
   * Same rule: only fields that came in are written.
   */
  async upsertContacts(contacts: WaContact[]): Promise<void> {
    await connectToDatabase()
    if (contacts.length === 0) return

    await WhatsAppContactModel.bulkWrite(
      contacts.map((contact) => {
        const $set: Record<string, string> = {}
        if (contact.name) $set.name = contact.name
        if (contact.pushName) $set.pushName = contact.pushName
        if (contact.phone) $set.phone = contact.phone
        if (contact.lid) $set.lid = contact.lid
        return {
          updateOne: {
            filter: { whatsappId: contact.jid },
            update: { $set, $setOnInsert: { whatsappId: contact.jid } },
            upsert: true,
          },
        }
      }),
      { ordered: false, throwOnValidationError: true }
    )
  },

  /** Which of these jids already have a stored contact. */
  async existingContactJids(jids: string[]): Promise<Set<string>> {
    await connectToDatabase()
    if (jids.length === 0) return new Set()
    const raw = await WhatsAppContactModel.find({ whatsappId: { $in: jids } })
      .select("whatsappId")
      .lean<{ whatsappId: string }[]>()
      .exec()
    return new Set(raw.map((item) => item.whatsappId))
  },

  /** Refreshes conversation titles for contacts whose names changed. */
  async syncContactDetailsByJids(jids: string[]): Promise<string[]> {
    await connectToDatabase()
    if (jids.length === 0) return []

    const contacts = await WhatsAppContactModel.find({
      whatsappId: { $in: jids },
    })
      .lean<RawContact[]>()
      .exec()
    const conversations = await WhatsAppConversationModel.find({
      contactId: { $in: contacts.map((contact) => contact._id) },
    })
      .select("contactId")
      .lean<{ _id: Types.ObjectId; contactId: Types.ObjectId }[]>()
      .exec()

    const withConversation = new Set(
      conversations.map((item) => String(item.contactId))
    )
    for (const contact of contacts) {
      if (withConversation.has(String(contact._id))) {
        await this.syncContactDetails(toContact(contact))
      }
    }
    return conversations.map((item) => String(item._id))
  },

  async findContactById(id: string): Promise<WhatsAppContact | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null
    const raw = await WhatsAppContactModel.findById(id)
      .lean<RawContact>()
      .exec()
    return raw ? toContact(raw) : null
  },

  async findContactByJid(jid: string): Promise<WhatsAppContact | null> {
    await connectToDatabase()
    const raw = await WhatsAppContactModel.findOne({ whatsappId: jid })
      .lean<RawContact>()
      .exec()
    return raw ? toContact(raw) : null
  },

  /** Returns the conversation for a chat, creating it on first sight. */
  async ensureConversation(
    chatJid: string,
    contact: WhatsAppContact
  ): Promise<{ conversation: WhatsAppConversation; created: boolean }> {
    await connectToDatabase()

    const result = await WhatsAppConversationModel.updateOne(
      { whatsappChatId: chatJid },
      {
        $setOnInsert: {
          whatsappChatId: chatJid,
          contactId: contact.id,
          title: contactDisplayName(contact),
          phone: contact.phone,
          unreadCount: 0,
        },
      },
      { upsert: true }
    ).exec()

    const raw = await WhatsAppConversationModel.findOne({
      whatsappChatId: chatJid,
    })
      .lean<RawConversation>()
      .exec()

    return {
      conversation: toConversation(raw as RawConversation),
      created: result.upsertedCount > 0,
    }
  },

  async findById(id: string): Promise<WhatsAppConversation | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null
    const raw = await WhatsAppConversationModel.findById(id)
      .lean<RawConversation>()
      .exec()
    return raw ? toConversation(raw) : null
  },

  async findByChatJid(chatJid: string): Promise<WhatsAppConversation | null> {
    await connectToDatabase()
    const raw = await WhatsAppConversationModel.findOne({
      whatsappChatId: chatJid,
    })
      .lean<RawConversation>()
      .exec()
    return raw ? toConversation(raw) : null
  },

  /** Most recent first; `search` matches the name or the phone digits. */
  async list({
    search,
    businessId,
    page,
    pageSize,
  }: {
    search?: string
    businessId?: string
    page: number
    pageSize: number
  }): Promise<Paginated<WhatsAppConversation>> {
    await connectToDatabase()

    const query: Record<string, unknown> = {}
    if (businessId) query.businessId = new Types.ObjectId(businessId)
    const term = search?.trim()
    if (term) {
      const digits = term.replace(/\D/g, "")
      query.$or = [
        { title: new RegExp(escapeRegex(term), "i") },
        ...(digits.length >= 3 ? [{ phone: new RegExp(digits) }] : []),
      ]
    }

    const [raw, total] = await Promise.all([
      WhatsAppConversationModel.find(query)
        .sort({ lastMessageAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<RawConversation[]>()
        .exec(),
      WhatsAppConversationModel.countDocuments(query).exec(),
    ])

    return {
      items: raw.map(toConversation),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  },

  /** Keeps the denormalized title and phone in step with the contact. */
  async syncContactDetails(contact: WhatsAppContact): Promise<void> {
    await connectToDatabase()
    await WhatsAppConversationModel.updateMany(
      { contactId: contact.id },
      {
        $set: {
          title: contactDisplayName(contact),
          ...(contact.phone ? { phone: contact.phone } : {}),
        },
      }
    ).exec()
  },

  /** Recomputes the inbox preview from the newest stored message. */
  async refreshSummary(conversationId: string): Promise<void> {
    await connectToDatabase()
    const latest = await whatsappMessageRepository.latest(conversationId)
    if (!latest) return

    await WhatsAppConversationModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessage: messagePreview(latest),
          lastMessageAt: latest.timestamp,
          lastMessageFromMe: latest.fromMe,
        },
      }
    ).exec()
  },

  async incrementUnread(conversationId: string, by: number): Promise<void> {
    if (by <= 0) return
    await connectToDatabase()
    await WhatsAppConversationModel.updateOne(
      { _id: conversationId },
      { $inc: { unreadCount: by } }
    ).exec()
  },

  /** WhatsApp's own count wins over local increments when it is known. */
  async setUnreadByChat(chatJid: string, unreadCount: number): Promise<void> {
    await connectToDatabase()
    await WhatsAppConversationModel.updateOne(
      { whatsappChatId: chatJid },
      { $set: { unreadCount: Math.max(0, unreadCount) } }
    ).exec()
  },

  async markRead(id: string): Promise<WhatsAppConversation | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null
    const raw = await WhatsAppConversationModel.findByIdAndUpdate(
      id,
      { $set: { unreadCount: 0 } },
      { returnDocument: "after" }
    )
      .lean<RawConversation>()
      .exec()
    return raw ? toConversation(raw) : null
  },

  async setLead(
    id: string,
    businessId: string | null,
    source: LeadLinkSource
  ): Promise<WhatsAppConversation | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null
    const raw = await WhatsAppConversationModel.findByIdAndUpdate(
      id,
      {
        $set: {
          businessId: businessId ? new Types.ObjectId(businessId) : null,
          leadLinkSource: source,
        },
      },
      { returnDocument: "after" }
    )
      .lean<RawConversation>()
      .exec()
    return raw ? toConversation(raw) : null
  },

  async listByBusiness(businessId: string): Promise<WhatsAppConversation[]> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(businessId)) return []
    const raw = await WhatsAppConversationModel.find({ businessId })
      .sort({ lastMessageAt: -1 })
      .lean<RawConversation[]>()
      .exec()
    return raw.map(toConversation)
  },

  /**
   * A LID turned out to be a known phone number. Whatever was stored under
   * the LID moves to the phone-number jid, merging into an existing
   * conversation when there is one, so one person never shows up twice.
   */
  /** Removes the conversation document only; messages go separately. */
  async deleteById(id: string): Promise<boolean> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return false
    const result = await WhatsAppConversationModel.deleteOne({ _id: id }).exec()
    return result.deletedCount > 0
  },

  /** Remembers that these chats were deleted now (see the model). */
  async markChatsDeleted(chatJids: string[], deletedAt: Date): Promise<void> {
    await connectToDatabase()
    if (chatJids.length === 0) return
    await WhatsAppDeletedChatModel.bulkWrite(
      chatJids.map((chatJid) => ({
        updateOne: {
          filter: { chatJid },
          update: { $set: { chatJid, deletedAt } },
          upsert: true,
        },
      }))
    )
  },

  /** When each of these chats was last deleted, for those that were. */
  async deletedChatTimes(chatJids: string[]): Promise<Map<string, Date>> {
    await connectToDatabase()
    if (chatJids.length === 0) return new Map()
    const rows = await WhatsAppDeletedChatModel.find({
      chatJid: { $in: chatJids },
    })
      .lean<{ chatJid: string; deletedAt: Date }[]>()
      .exec()
    return new Map(rows.map((row) => [row.chatJid, row.deletedAt]))
  },

  /**
   * Deletes conversations opened under a LID that never got a message and
   * belong to no lead: leftovers of chat events for people whose messages
   * live in their conversation by phone. Returns how many were removed.
   */
  async removeEmptyLidConversations(): Promise<number> {
    await connectToDatabase()
    const candidates = await WhatsAppConversationModel.find({
      whatsappChatId: /@lid$/,
      businessId: null,
    })
      .select("_id")
      .lean<{ _id: Types.ObjectId }[]>()
      .exec()
    if (candidates.length === 0) return 0

    const withMessages =
      await whatsappMessageRepository.conversationsWithMessages(
        candidates.map((item) => String(item._id))
      )
    const empty = candidates.filter(
      (item) => !withMessages.has(String(item._id))
    )
    if (empty.length === 0) return 0

    const result = await WhatsAppConversationModel.deleteMany({
      _id: { $in: empty.map((item) => item._id) },
      // Re-checked here in case a lead was linked meanwhile.
      businessId: null,
    }).exec()
    return result.deletedCount
  },

  async mergeLid(lid: string, pnJid: string, phone?: string): Promise<boolean> {
    await connectToDatabase()
    if (lid === pnJid) return false

    const [lidContact, pnContact] = await Promise.all([
      WhatsAppContactModel.findOne({ whatsappId: lid }).lean<RawContact>(),
      WhatsAppContactModel.findOne({ whatsappId: pnJid }).lean<RawContact>(),
    ])

    let targetContactId: Types.ObjectId | undefined = pnContact?._id
    if (lidContact && pnContact) {
      await WhatsAppContactModel.updateOne(
        { _id: pnContact._id },
        {
          $set: {
            lid,
            ...(!pnContact.name && lidContact.name
              ? { name: lidContact.name }
              : {}),
            ...(!pnContact.pushName && lidContact.pushName
              ? { pushName: lidContact.pushName }
              : {}),
          },
        }
      )
      await WhatsAppContactModel.deleteOne({ _id: lidContact._id })
    } else if (lidContact) {
      await WhatsAppContactModel.updateOne(
        { _id: lidContact._id },
        { $set: { whatsappId: pnJid, lid, ...(phone ? { phone } : {}) } }
      )
      targetContactId = lidContact._id
    } else if (pnContact) {
      await WhatsAppContactModel.updateOne(
        { _id: pnContact._id },
        { $set: { lid } }
      )
    }

    const lidConversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: lid,
    }).lean<RawConversation>()
    if (!lidConversation) return Boolean(lidContact)

    const pnConversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: pnJid,
    }).lean<RawConversation>()

    if (pnConversation) {
      await whatsappMessageRepository.moveToConversation(
        String(lidConversation._id),
        String(pnConversation._id)
      )
      await WhatsAppConversationModel.updateOne(
        { _id: pnConversation._id },
        {
          $inc: { unreadCount: lidConversation.unreadCount ?? 0 },
          ...(!pnConversation.businessId && lidConversation.businessId
            ? {
                $set: {
                  businessId: lidConversation.businessId,
                  leadLinkSource: lidConversation.leadLinkSource,
                },
              }
            : {}),
        }
      )
      await WhatsAppConversationModel.deleteOne({ _id: lidConversation._id })
      await this.refreshSummary(String(pnConversation._id))
    } else {
      await WhatsAppConversationModel.updateOne(
        { _id: lidConversation._id },
        {
          $set: {
            whatsappChatId: pnJid,
            ...(phone ? { phone } : {}),
            ...(targetContactId ? { contactId: targetContactId } : {}),
          },
        }
      )
    }

    const contact = targetContactId
      ? await this.findContactById(String(targetContactId))
      : null
    if (contact) await this.syncContactDetails(contact)
    return true
  },
}
