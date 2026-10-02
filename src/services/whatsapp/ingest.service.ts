import type { WhatsAppConversation } from "@/domain/whatsapp"
import type {
  WaBatch,
  WaBatchSource,
  WaContact,
  WaMessage,
} from "@/lib/whatsapp/client"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"
import { whatsappMessageRepository } from "@/repositories/whatsapp-message.repository"
import { findLeadByPhone } from "@/services/whatsapp/lead-matcher"

export type IngestResult = {
  /** Conversations created or changed by this batch. */
  conversationIds: string[]
  newMessages: number
  /** Conversations that got a new message from the contact. */
  repliedConversationIds: string[]
  /** Conversations that got a new message sent by us. */
  contactedConversationIds: string[]
}

export type IngestOptions = {
  /** History older than this is skipped, so a sync never pulls everything. */
  historySince?: Date
}

function phoneFromJid(jid: string): string | undefined {
  const match = /^(\d+)@s\.whatsapp\.net$/.exec(jid)
  return match?.[1]
}

/** Links a new conversation to a lead when the phone identifies one. */
async function autoLinkLead(conversation: WhatsAppConversation) {
  if (conversation.businessId || conversation.leadLinkSource === "manual")
    return
  const businessId = await findLeadByPhone(conversation.phone)
  if (businessId) {
    await whatsappConversationRepository.setLead(
      conversation.id,
      businessId,
      "auto"
    )
  }
}

/**
 * Persists one batch from WhatsApp. This is the heart of the sync and it is
 * idempotent: contacts and conversations are upserts keyed by jid, messages
 * are inserted only when their WhatsApp id is new, and previews are recomputed
 * from what is stored. Replaying a batch — after a crash halfway, a reconnect
 * or a manual sync — changes nothing.
 */
export async function ingestBatch(
  batch: WaBatch,
  source: WaBatchSource,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const touched = new Set<string>()

  const since = source === "history" ? options.historySince : undefined
  const messages = since
    ? batch.messages.filter((message) => message.timestamp >= since)
    : batch.messages

  // 1. Contacts WhatsApp told us about. Anything stored under a LID that now
  //    has a phone number is merged first, so it is not stored twice.
  const lidsWithPhone = batch.contacts.flatMap((contact) =>
    contact.lid && contact.lid !== contact.jid
      ? [{ lid: contact.lid, jid: contact.jid, phone: contact.phone }]
      : []
  )
  const storedLids = await whatsappConversationRepository.existingContactJids(
    lidsWithPhone.map((item) => item.lid)
  )
  for (const item of lidsWithPhone) {
    if (storedLids.has(item.lid)) {
      await whatsappConversationRepository.mergeLid(
        item.lid,
        item.jid,
        item.phone
      )
    }
  }

  await whatsappConversationRepository.upsertContacts(batch.contacts)
  const renamed = await whatsappConversationRepository.syncContactDetailsByJids(
    batch.contacts
      .filter((contact) => contact.name || contact.pushName)
      .map((contact) => contact.jid)
  )
  for (const id of renamed) touched.add(id)

  // 2. Conversations: every chat with a message in the window, plus chats
  //    with unread messages. Older idle chats are not imported.
  const pushNames = new Map<string, string>()
  for (const message of messages) {
    if (message.pushName) pushNames.set(message.chatJid, message.pushName)
  }

  const chatJids = new Set<string>(messages.map((message) => message.chatJid))
  for (const chat of batch.chats) {
    if ((chat.unreadCount ?? 0) > 0) chatJids.add(chat.jid)
  }
  const chatNames = new Map(
    batch.chats.flatMap((chat) => (chat.name ? [[chat.jid, chat.name]] : []))
  )

  const conversationByJid = new Map<string, WhatsAppConversation>()
  for (const jid of chatJids) {
    const existing = await whatsappConversationRepository.findContactByJid(jid)
    const contactInput: WaContact = {
      jid,
      phone: phoneFromJid(jid),
      // Never overwrite a saved name with a chat or profile name.
      name: existing?.name ? undefined : chatNames.get(jid),
      pushName: pushNames.get(jid),
    }
    const contact =
      existing && !contactInput.name && !contactInput.pushName
        ? existing
        : await whatsappConversationRepository.upsertContact(contactInput)

    const { conversation, created } =
      await whatsappConversationRepository.ensureConversation(jid, contact)
    conversationByJid.set(jid, conversation)

    if (created) {
      touched.add(conversation.id)
      await autoLinkLead(conversation)
    } else if (contactInput.name || contactInput.pushName) {
      await whatsappConversationRepository.syncContactDetails(contact)
    }
  }

  // 3. Messages: only the new ones are written.
  const inserted = await whatsappMessageRepository.insertNew(
    messages.flatMap((message: WaMessage) => {
      const conversation = conversationByJid.get(message.chatJid)
      return conversation ? [{ conversationId: conversation.id, message }] : []
    })
  )

  const newIncoming = new Map<string, number>()
  const withNewMessages = new Set<string>()
  const withNewOutgoing = new Set<string>()
  for (const item of inserted) {
    withNewMessages.add(item.conversationId)
    if (item.fromMe) withNewOutgoing.add(item.conversationId)
    else {
      newIncoming.set(
        item.conversationId,
        (newIncoming.get(item.conversationId) ?? 0) + 1
      )
    }
  }

  // 4. Previews and unread counters.
  for (const conversationId of withNewMessages) {
    await whatsappConversationRepository.refreshSummary(conversationId)
    touched.add(conversationId)
  }

  // History is old news: only fresh messages bump the unread counter.
  if (source !== "history") {
    for (const [conversationId, count] of newIncoming) {
      await whatsappConversationRepository.incrementUnread(
        conversationId,
        count
      )
    }
  }

  // WhatsApp's absolute count, when present, is the source of truth.
  for (const chat of batch.chats) {
    if (chat.unreadCount === undefined) continue
    const conversation =
      conversationByJid.get(chat.jid) ??
      (await whatsappConversationRepository.findByChatJid(chat.jid))
    if (!conversation) continue
    if (conversation.unreadCount !== chat.unreadCount) {
      await whatsappConversationRepository.setUnreadByChat(
        chat.jid,
        chat.unreadCount
      )
      touched.add(conversation.id)
    }
  }

  return {
    conversationIds: [...touched],
    newMessages: inserted.length,
    repliedConversationIds: [...newIncoming.keys()],
    contactedConversationIds: [...withNewOutgoing],
  }
}
