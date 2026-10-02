import {
  getContentType,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  isPnUser,
  jidDecode,
  jidNormalizedUser,
  normalizeMessageContent,
  toNumber,
  type Chat,
  type Contact,
  type WAMessage,
} from "baileys"

import {
  WHATSAPP_QUOTE_MAX_LENGTH,
  type WhatsAppMessageStatus,
  type WhatsAppMessageType,
} from "@/domain/whatsapp"
import type {
  WaChat,
  WaContact,
  WaMedia,
  WaMessage,
  WaQuote,
} from "@/lib/whatsapp/client"

/**
 * Translates Baileys payloads into the CRM's shapes. Pure functions: no
 * socket, no database, so they are unit-tested directly.
 */

/** Never shown in the inbox: status updates, broadcast lists, channels. */
export function isIgnoredJid(jid: string, includeGroups: boolean): boolean {
  if (isJidStatusBroadcast(jid) || isJidBroadcast(jid) || isJidNewsletter(jid))
    return true
  if (isJidGroup(jid)) return !includeGroups
  return false
}

/**
 * WhatsApp addresses a person either by phone-number jid or by LID. The phone
 * jid is preferred so one person never becomes two conversations.
 */
export function canonicalJid(jid: string, ...alternatives: unknown[]): string {
  const normalized = jidNormalizedUser(jid) || jid
  if (!isLidUser(normalized)) return normalized

  for (const alt of alternatives) {
    if (typeof alt === "string" && isPnUser(alt)) return jidNormalizedUser(alt)
  }
  return normalized
}

/** Digits of a phone-number jid; LIDs carry no phone. */
export function phoneFromJid(jid?: string | null): string | undefined {
  if (!jid || !isPnUser(jid)) return undefined
  const user = jidDecode(jid)?.user
  return user && /^\d+$/.test(user) ? user : undefined
}

/** Content types that are protocol chatter rather than something to show. */
const IGNORED_CONTENT = new Set([
  "protocolMessage",
  "reactionMessage",
  "encReactionMessage",
  "senderKeyDistributionMessage",
  "messageContextInfo",
  "pollUpdateMessage",
  "keepInChatMessage",
  "pinInChatMessage",
])

const STATUS_BY_ACK: Record<number, WhatsAppMessageStatus> = {
  0: "ERROR",
  1: "PENDING",
  2: "SENT",
  3: "DELIVERED",
  4: "READ",
  5: "READ",
}

export function statusFromAck(
  ack: number | null | undefined,
  fromMe: boolean
): WhatsAppMessageStatus {
  if (!fromMe) return "RECEIVED"
  return (ack !== null && ack !== undefined && STATUS_BY_ACK[ack]) || "SENT"
}

type MediaInfo = Omit<WaMedia, "download">

function describeContent(
  content: NonNullable<WAMessage["message"]>
): { type: WhatsAppMessageType; body: string; media?: MediaInfo } | null {
  const kind = getContentType(content)
  if (!kind || IGNORED_CONTENT.has(kind)) return null

  switch (kind) {
    case "conversation":
      return { type: "text", body: content.conversation ?? "" }
    case "extendedTextMessage":
      return { type: "text", body: content.extendedTextMessage?.text ?? "" }
    case "imageMessage":
      return {
        type: "image",
        body: content.imageMessage?.caption ?? "",
        media: { mimeType: content.imageMessage?.mimetype || "image/jpeg" },
      }
    case "videoMessage":
    case "ptvMessage": {
      // ptv: the round "video note", same payload without a caption.
      const video = content.videoMessage ?? content.ptvMessage
      return {
        type: "video",
        body: content.videoMessage?.caption ?? "",
        media: {
          mimeType: video?.mimetype || "video/mp4",
          seconds: video?.seconds ?? undefined,
        },
      }
    }
    case "audioMessage": {
      const audio = content.audioMessage
      return {
        type: "audio",
        body: "",
        media: {
          mimeType: audio?.mimetype || "audio/ogg",
          seconds: audio?.seconds ?? undefined,
          voiceNote: Boolean(audio?.ptt),
        },
      }
    }
    case "documentMessage":
      return {
        type: "document",
        body:
          content.documentMessage?.caption ??
          content.documentMessage?.fileName ??
          "",
      }
    case "stickerMessage":
      return {
        type: "sticker",
        body: "",
        media: { mimeType: content.stickerMessage?.mimetype || "image/webp" },
      }
    case "locationMessage":
    case "liveLocationMessage":
      return { type: "location", body: "" }
    case "contactMessage":
      return {
        type: "contact",
        body: content.contactMessage?.displayName ?? "",
      }
    case "contactsArrayMessage":
      return {
        type: "contact",
        body: content.contactsArrayMessage?.displayName ?? "",
      }
    default:
      return { type: "other", body: "" }
  }
}

type ContextInfo = {
  stanzaId?: string | null
  participant?: string | null
  quotedMessage?: WAMessage["message"]
}

/** The reply metadata every message kind may carry. */
function contextInfoOf(
  content: NonNullable<WAMessage["message"]>
): ContextInfo | undefined {
  const kind = getContentType(content)
  if (!kind) return undefined
  const inner = content[kind] as { contextInfo?: ContextInfo } | undefined
  return typeof inner === "object" && inner ? inner.contextInfo : undefined
}

/** What a reply quotes, or undefined when the message is not a reply. */
export function quoteOf(
  content: NonNullable<WAMessage["message"]>,
  meJid?: string
): WaQuote | undefined {
  const context = contextInfoOf(content)
  if (!context?.stanzaId) return undefined

  const quotedContent = normalizeMessageContent(context.quotedMessage)
  const described = quotedContent ? describeContent(quotedContent) : null
  const participant = context.participant
    ? jidNormalizedUser(context.participant)
    : undefined
  return {
    id: context.stanzaId,
    fromMe: Boolean(meJid && participant === jidNormalizedUser(meJid)),
    type: described?.type ?? "other",
    body: (described?.body ?? "").slice(0, WHATSAPP_QUOTE_MAX_LENGTH),
  }
}

/** Fetches a message's file; the socket supplies it, tests leave it out. */
export type MediaDownloader = (message: WAMessage) => Promise<Buffer>

/** Returns null for anything that is not a displayable message. */
export function normalizeMessage(
  message: WAMessage,
  meJid?: string,
  download?: MediaDownloader
): WaMessage | null {
  const key = message.key
  if (!key?.id || !key.remoteJid) return null

  const content = normalizeMessageContent(message.message)
  if (!content) return null

  const described = describeContent(content)
  if (!described) return null

  const chatJid = canonicalJid(key.remoteJid, key.remoteJidAlt)
  const me = meJid ? jidNormalizedUser(meJid) : "me"
  const fromMe = Boolean(key.fromMe)
  const seconds = toNumber(message.messageTimestamp ?? 0)

  // In groups the sender is the participant, not the chat.
  const sender = key.participant
    ? canonicalJid(key.participant, key.participantAlt)
    : chatJid

  return {
    id: key.id,
    chatJid,
    fromMe,
    from: fromMe ? me : sender,
    to: fromMe ? chatJid : me,
    body: described.body,
    type: described.type,
    timestamp: seconds > 0 ? new Date(seconds * 1000) : new Date(),
    status: statusFromAck(message.status, fromMe),
    pushName: fromMe ? undefined : (message.pushName ?? undefined),
    quoted: quoteOf(content, meJid),
    media:
      described.media && download
        ? { ...described.media, download: () => download(message) }
        : undefined,
  }
}

export function normalizeChat(chat: Partial<Chat>): WaChat | null {
  if (!chat.id) return null
  return {
    jid: canonicalJid(chat.id, chat.pnJid),
    name: chat.name ?? undefined,
    unreadCount:
      typeof chat.unreadCount === "number"
        ? Math.max(0, chat.unreadCount)
        : undefined,
  }
}

export function normalizeContact(contact: Partial<Contact>): WaContact | null {
  if (!contact.id) return null

  const jid = canonicalJid(contact.id, contact.phoneNumber)
  const lid = contact.lid ?? (isLidUser(contact.id) ? contact.id : undefined)

  return {
    jid,
    lid: lid ? jidNormalizedUser(lid) : undefined,
    phone: phoneFromJid(jid),
    name: contact.name ?? undefined,
    pushName: contact.notify ?? undefined,
    // "changed"/"removed" from a picture notification; null from a sync.
    pictureChanged: contact.imgUrl !== undefined || undefined,
  }
}
