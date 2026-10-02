/**
 * WhatsApp inbox: connection states, conversations and messages.
 * Pure TypeScript: no Baileys, no Mongoose, no I/O.
 */

export const WHATSAPP_STATUS = [
  "DISCONNECTED",
  "INITIALIZING",
  "QR_REQUIRED",
  "CONNECTED",
  "SYNCING",
  "READY",
  "RECONNECTING",
  "LOGGED_OUT",
  "ERROR",
] as const

export type WhatsAppStatus = (typeof WHATSAPP_STATUS)[number]

export const WHATSAPP_STATUS_LABELS: Record<WhatsAppStatus, string> = {
  DISCONNECTED: "Desconectado",
  INITIALIZING: "Conectando WhatsApp...",
  QR_REQUIRED: "Aguardando leitura do QR Code",
  CONNECTED: "Conectado",
  SYNCING: "Sincronizando mensagens...",
  READY: "Conectado",
  RECONNECTING: "Reconectando...",
  LOGGED_OUT: "Sessão encerrada",
  ERROR: "Erro na conexão",
}

/** States in which the connection is up and messages can be sent. */
export function isWhatsAppOnline(status: WhatsAppStatus): boolean {
  return status === "CONNECTED" || status === "SYNCING" || status === "READY"
}

/** States that resolve on their own, worth polling more often. */
export function isWhatsAppTransitional(status: WhatsAppStatus): boolean {
  return (
    status === "INITIALIZING" ||
    status === "QR_REQUIRED" ||
    status === "CONNECTED" ||
    status === "SYNCING" ||
    status === "RECONNECTING"
  )
}

export const WHATSAPP_MESSAGE_TYPES = [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "location",
  "contact",
  "other",
] as const

export type WhatsAppMessageType = (typeof WHATSAPP_MESSAGE_TYPES)[number]

/** Shown in place of a body for media, which v1 does not download. */
export const WHATSAPP_MEDIA_PLACEHOLDERS: Record<WhatsAppMessageType, string> =
  {
    text: "",
    image: "[imagem]",
    video: "[vídeo]",
    audio: "[áudio]",
    document: "[documento]",
    sticker: "[figurinha]",
    location: "[localização]",
    contact: "[contato]",
    other: "[mensagem não suportada]",
  }

/**
 * Delivery state. Incoming messages are "RECEIVED"; outgoing ones climb from
 * PENDING to READ and never go back.
 */
export const WHATSAPP_MESSAGE_STATUS = [
  "ERROR",
  "PENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "RECEIVED",
] as const

export type WhatsAppMessageStatus = (typeof WHATSAPP_MESSAGE_STATUS)[number]

/** Outgoing statuses that a given status may still be promoted from. */
export function lowerMessageStatuses(
  status: WhatsAppMessageStatus
): WhatsAppMessageStatus[] {
  const order: WhatsAppMessageStatus[] = [
    "PENDING",
    "SENT",
    "DELIVERED",
    "READ",
  ]
  const index = order.indexOf(status)
  return index <= 0 ? [] : order.slice(0, index)
}

/** How a conversation got (or lost) its lead. */
export type LeadLinkSource = "auto" | "manual"

export type WhatsAppContact = {
  id: string
  /** Canonical jid: the phone-number jid when known, the LID otherwise. */
  whatsappId: string
  lid?: string
  /** Digits only, with country code. */
  phone?: string
  /** Name saved in the phone's address book. */
  name?: string
  /** Name the contact set on their own profile. */
  pushName?: string
  profilePicture?: string
  createdAt: Date
  updatedAt: Date
}

export type WhatsAppConversation = {
  id: string
  contactId: string
  /** The lead (Business) this conversation is about, when linked. */
  businessId?: string
  leadLinkSource?: LeadLinkSource
  whatsappChatId: string
  /** Display name, denormalized from the contact for listing and search. */
  title: string
  phone?: string
  lastMessage?: string
  lastMessageAt?: Date
  lastMessageFromMe?: boolean
  unreadCount: number
  createdAt: Date
  updatedAt: Date
}

export type WhatsAppMessage = {
  id: string
  conversationId: string
  whatsappMessageId: string
  from: string
  to: string
  body: string
  type: WhatsAppMessageType
  timestamp: Date
  fromMe: boolean
  status: WhatsAppMessageStatus
  mediaUrl?: string
  createdAt: Date
}

export type WhatsAppSyncStats = {
  startedAt: Date
  finishedAt?: Date
  conversations: number
  newMessages: number
}

/** Metadata only: credentials stay in the local session folder. */
export type WhatsAppSessionInfo = {
  sessionName: string
  status: WhatsAppStatus
  phoneNumber?: string
  pushName?: string
  lastConnectedAt?: Date
  lastSyncAt?: Date
  lastSync?: WhatsAppSyncStats
  lastSyncError?: string
}

/** Best display name for a contact, falling back to the phone number. */
export function contactDisplayName(
  contact: Pick<WhatsAppContact, "name" | "pushName" | "phone">
): string {
  return (
    contact.name?.trim() ||
    contact.pushName?.trim() ||
    (contact.phone ? `+${contact.phone}` : "Contato sem nome")
  )
}

/**
 * Key used to compare phone numbers across sources. Brazilian mobiles may or
 * may not carry the ninth digit and the country code, so they are reduced to
 * 55 + area code + last 8 digits. Other numbers compare as plain digits.
 *
 * `international` says the number carries its country code — always true for
 * WhatsApp ids, and assumed for numbers written with a leading "+". Without
 * it, a 10-11 digit number is taken as Brazilian without the 55.
 */
export function phoneMatchKey(
  raw?: string | null,
  options: { international?: boolean } = {}
): string | undefined {
  let digits = raw?.replace(/\D/g, "")
  if (!digits || digits.length < 8) return undefined

  const international = options.international ?? raw?.trim().startsWith("+")
  const isBrazilian =
    digits.startsWith("55") && (digits.length === 12 || digits.length === 13)

  if (isBrazilian) digits = digits.slice(2)
  else if (international) return digits

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits.slice(0, 2)}${digits.slice(-8)}`
  }

  return digits
}

/** Formats WhatsApp digits ("5511999998888") for display. */
export function formatWhatsAppPhone(digits?: string | null): string {
  if (!digits) return ""
  const match = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits)
  if (match) return `+55 ${match[1]} ${match[2]}-${match[3]}`
  return `+${digits}`
}

/**
 * Turns a phone as stored on a lead into WhatsApp digits (country code
 * included). Numbers without a country code are taken as Brazilian. Returns
 * undefined for anything that cannot be a phone number.
 */
export function toWhatsAppNumber(raw?: string | null): string | undefined {
  const digits = raw?.replace(/\D/g, "")
  if (!digits || digits.length < 10) return undefined
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13))
    return digits
  if (raw?.trim().startsWith("+")) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return undefined
}

/** A lead's numbers worth trying, best first: WhatsApp link, phone, registry. */
export function leadWhatsAppCandidates(lead: {
  phone?: string
  enrichment?: { socials?: { whatsapp?: string } }
  registry?: { phones?: string[] }
}): string[] {
  const candidates = [
    lead.enrichment?.socials?.whatsapp,
    lead.phone,
    ...(lead.registry?.phones ?? []),
  ]
    .map(toWhatsAppNumber)
    .filter((value): value is string => Boolean(value))
  return [...new Set(candidates)]
}
