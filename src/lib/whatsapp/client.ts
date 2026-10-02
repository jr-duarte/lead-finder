import type {
  WhatsAppMessageStatus,
  WhatsAppMessageType,
} from "@/domain/whatsapp"

/**
 * The boundary between the CRM and the WhatsApp library. Services only see
 * these shapes, so Baileys stays in one file and tests swap in a fake.
 */

export type WaChat = {
  jid: string
  name?: string
  /** Absolute count reported by WhatsApp; absent when unknown. */
  unreadCount?: number
}

export type WaContact = {
  jid: string
  lid?: string
  /** Digits only, with country code. */
  phone?: string
  name?: string
  pushName?: string
}

export type WaMessage = {
  id: string
  chatJid: string
  fromMe: boolean
  from: string
  to: string
  body: string
  type: WhatsAppMessageType
  timestamp: Date
  status: WhatsAppMessageStatus
  /** Sender's profile name, used to name contacts we have never seen. */
  pushName?: string
  /** Present for images, audio and stickers, whose file can be fetched. */
  media?: WaMedia
}

export type WaMedia = {
  mimeType: string
  seconds?: number
  voiceNote?: boolean
  /** Fetches and decrypts the file from WhatsApp's servers. */
  download: () => Promise<Buffer>
}

export type WaOutgoingMedia =
  | { kind: "image"; data: Buffer; mimeType: string; caption?: string }
  /** Audio must already be Ogg/Opus when sent as a voice note. */
  | { kind: "audio"; data: Buffer; mimeType: string; voiceNote: boolean }

/** One delivery of data from WhatsApp, in whatever mix it arrived. */
export type WaBatch = {
  chats: WaChat[]
  contacts: WaContact[]
  messages: WaMessage[]
}

/**
 * - "history": history sync from the phone (first login, or catch-up).
 * - "offline": messages received while the CRM was closed.
 * - "live": messages arriving while connected.
 */
export type WaBatchSource = "history" | "offline" | "live"

export type WaCloseReason = {
  /** The phone unlinked this device: credentials are useless now. */
  loggedOut: boolean
  /** WhatsApp asked for a fresh socket, e.g. right after pairing. */
  restartRequired: boolean
  /** The QR codes ran out without being scanned. */
  qrExpired: boolean
  /** Another client opened this same session and took over. */
  replaced: boolean
  message?: string
}

export type WaClientHandlers = {
  onQr: (qr: string) => void
  onOpen: (me: { phone?: string; pushName?: string }) => void
  onClose: (reason: WaCloseReason) => void
  /** WhatsApp finished delivering what was pending while offline. */
  onCaughtUp: () => void
  /** History sync progress (0-100) when WhatsApp reports it. */
  onHistoryProgress: (progress: number) => void
  onBatch: (batch: WaBatch, source: WaBatchSource) => void
  onMessageStatus: (
    updates: { id: string; status: WhatsAppMessageStatus }[]
  ) => void
  /** A LID turned out to belong to this phone-number jid. */
  onLidMapping: (mapping: { lid: string; pnJid: string }) => void
}

export type WaOutreachStatus = {
  /** New chats are blocked for now (error 463 territory). */
  restricted: boolean
  restrictedUntil?: Date
  /** New chats still allowed in the current quota cycle. */
  newChatsRemaining?: number
}

export interface WhatsAppClient {
  start(handlers: WaClientHandlers): Promise<void>
  sendText(chatJid: string, text: string): Promise<WaMessage>
  sendMedia(chatJid: string, media: WaOutgoingMedia): Promise<WaMessage>
  /**
   * Asks WhatsApp whether a number (digits with country code) has an
   * account, returning its jid — which may differ from the digits, e.g. old
   * Brazilian accounts without the ninth digit. Null when it has none.
   */
  checkNumber(phone: string): Promise<string | null>
  /**
   * Whether WhatsApp is limiting this account's outreach to new contacts.
   * Fields are absent when WhatsApp does not say.
   */
  outreachStatus(): Promise<WaOutreachStatus>
  /** Unlinks the device on the phone and drops the local credentials. */
  logout(): Promise<void>
  /** Closes the socket but keeps the session for the next start. */
  stop(): Promise<void>
}

export type WhatsAppClientConfig = {
  authDir: string
  includeGroups: boolean
  /** Looks up a sent message, which WhatsApp may ask for on retries. */
  getStoredMessage: (id: string) => Promise<string | undefined>
}

export type WhatsAppClientFactory = (
  config: WhatsAppClientConfig
) => WhatsAppClient
