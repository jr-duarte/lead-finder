import type { SendWindow } from "@/domain/campaign"
import type { WhatsAppMessageType } from "@/domain/whatsapp"

/**
 * Follow-up: one more WhatsApp message for a lead in "Contatado" that did
 * not answer. Written by Claude, approved by the user, sent inside the send
 * window and never counted against the daily first-contact limit. If the
 * lead still does not answer, the user may move it to "Perdido".
 * Pure TypeScript: no I/O.
 */

/** Days without an answer before a lead gets its follow-up. */
export const FOLLOW_UP_AFTER_DAYS = 3
/** Days after the follow-up before "Mover para Perdido" is offered. */
export const NO_REPLY_AFTER_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

export const FOLLOW_UP_STATUS = [
  /** Waiting for its message to be written. */
  "PENDING",
  "GENERATING",
  /** Message ready, waiting for the user's approval. */
  "READY",
  /** In the send queue. */
  "APPROVED",
  "SENDING",
  /** Sent, waiting for an answer. */
  "SENT",
  /** No answer after the follow-up: the user decides what to do. */
  "NO_REPLY",
  /** The lead answered (before or after the follow-up). */
  "REPLIED",
  /** Moved to "Perdido" from here. */
  "LOST",
  /** Over without a send or a loss: kept by the user, or moved on the board. */
  "CLOSED",
  /** Not sent: something changed before it went out (see reason). */
  "CANCELLED",
  /** Left out by the user. */
  "SKIPPED",
  "FAILED",
] as const

export type FollowUpStatus = (typeof FOLLOW_UP_STATUS)[number]

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  PENDING: "Na fila para gerar",
  GENERATING: "Gerando mensagem",
  READY: "Aguardando aprovação",
  APPROVED: "Na fila de envio",
  SENDING: "Enviando",
  SENT: "Aguardando resposta",
  NO_REPLY: "Sem resposta",
  REPLIED: "Respondeu",
  LOST: "Movido para Perdido",
  CLOSED: "Encerrado",
  CANCELLED: "Cancelado",
  SKIPPED: "Pulado",
  FAILED: "Falhou",
}

/** Not sent yet: anything that happens on WhatsApp may still cancel it. */
export const UNSENT_FOLLOW_UP_STATUSES: FollowUpStatus[] = [
  "PENDING",
  "GENERATING",
  "READY",
  "APPROVED",
  "FAILED",
]

/** Sent and still waiting on the lead. */
export const AWAITING_FOLLOW_UP_STATUSES: FollowUpStatus[] = [
  "SENT",
  "NO_REPLY",
]

export type FollowUp = {
  id: string
  businessId: string
  /** Denormalized so the list needs no join. */
  businessName: string
  conversationId: string
  /** The campaign of the first message, whose angle the follow-up keeps. */
  campaignId?: string
  campaignName?: string
  /** Our last message when the follow-up was created: the one unanswered. */
  anchorAt: Date
  message?: string
  status: FollowUpStatus
  /** Why it was cancelled, failed or closed, in words for the user. */
  reason?: string
  /** Send window, zone and pace: the campaign's, or the defaults. */
  window: SendWindow
  timeZone: string
  intervalMinutes: number
  /** Automatic replies the lead's number sent, shown so the user can check. */
  autoReplies: string[]
  sentAt?: Date
  createdAt: Date
  updatedAt: Date
}

export type FollowUpCounts = Record<FollowUpStatus, number>

export function emptyFollowUpCounts(): FollowUpCounts {
  return Object.fromEntries(
    FOLLOW_UP_STATUS.map((status) => [status, 0])
  ) as FollowUpCounts
}

/** When a lead whose last message from us is `anchorAt` gets its follow-up. */
export function followUpDueAt(anchorAt: Date): Date {
  return new Date(anchorAt.getTime() + FOLLOW_UP_AFTER_DAYS * DAY_MS)
}

/** When a follow-up sent at `sentAt` counts as unanswered. */
export function noReplyAt(sentAt: Date): Date {
  return new Date(sentAt.getTime() + NO_REPLY_AFTER_DAYS * DAY_MS)
}

// ---------------------------------------------------------------------------
// Automatic replies
// ---------------------------------------------------------------------------

/**
 * What a message from the lead is:
 * - "automated": a greeting, away message or menu sent by WhatsApp Business;
 * - "human": a person answered;
 * - "pending": not decided yet, waiting for Claude.
 * Messages never classified count as human, which is how they were treated
 * before this existed.
 */
export const AUTO_REPLY_VERDICTS = ["automated", "human", "pending"] as const
export type AutoReplyVerdict = (typeof AUTO_REPLY_VERDICTS)[number]

export const AUTO_REPLY_SOURCES = ["heuristic", "ai", "manual"] as const
export type AutoReplySource = (typeof AUTO_REPLY_SOURCES)[number]

/** "uncertain" asks Claude; the others are final. */
export type HeuristicVerdict = "automated" | "human" | "uncertain"

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** Phrases only a bot writes. Matched on lowercase text without accents. */
const AUTOMATED_PATTERNS: RegExp[] = [
  /\b(mensagem|resposta|mensaje|respuesta) automatic[ao]\b/,
  /\bauto-?reply\b|\bautomatic reply\b|\bout of office\b/,
  /\bdigite (o numero|a opcao|uma opcao|\d)/,
  /\b(responda|envie) (com )?o numero\b/,
  /\b(escolha|selecione) (uma|a) (das )?opc/,
  /\b(escribe|envia) el numero\b|\belige una opcion\b/,
  /\b(nosso|o|nuestro) horario de (atendimento|funcionamento|atencion)\b/,
  /\bfora do (nosso )?horario\b|\bfuera de(l)? horario\b/,
  /\b(em breve|logo|assim que possivel)\b[^.!?\n]{0,50}\b(retornaremos|responderemos|retornamos|respondemos|entraremos em contato|atendente|nossa equipe)/,
  /\ben breve\b[^.!?\n]{0,50}\b(responderemos|te atenderemos|le atenderemos|nos comunicaremos)/,
  /\b(estamos|nos encontramos) (ausentes|indisponiveis|fora do escritorio)\b/,
  /\b(seja|sea) bem[- ]?vind[oa]/,
  /\bbienvenid[oa] a\b/,
  /\bobrigad[oa] (por|pelo) (entrar em |seu |o )?contato\b[^\n]{0,80}\b(em breve|retorn|respond|atendente|aguarde)/,
  /\bgracias por (comunicarte|contactarnos|escribirnos|tu mensaje)\b[^\n]{0,80}\b(en breve|pronto|respond)/,
  /\bthank you for (contacting|your message|reaching out)\b/,
  /\baguarde\b[^.!?\n]{0,30}\b(atendente|atendimento|retorno|sera atendid)/,
]

/** Phrases a bot often writes but a person might too: Claude decides. */
const MAYBE_AUTOMATED_PATTERNS: RegExp[] = [
  /\bobrigad[oa] (por|pelo) (entrar em |seu |o )?contato\b/,
  /\bgracias por (comunicarte|contactar|escribir)/,
  /\b(como|em que) (podemos|posso) (te |lhe )?ajudar\b/,
  /\ben (que|qué) (podemos|puedo) ayudar/,
  /\bem breve\b|\ben breve\b/,
  /\batendimento\b/,
]

/** A numbered menu: two or more lines starting with "1 -", "2)", "3️⃣"... */
function looksLikeMenu(text: string): boolean {
  const lines = text
    .split("\n")
    .filter((line) => /^\s*(\d{1,2}\s*[-).:]|\d️?⃣)/.test(line))
  return lines.length >= 2
}

/** Answers this fast and this long are rarely typed by a person. */
const FAST_REPLY_SECONDS = 30
const LONG_REPLY_CHARS = 80

/**
 * First, cheap pass over a message from the lead. Only text can be a
 * greeting: audio, pictures and the like are always a person.
 */
export function classifyAutoReply(input: {
  body: string
  type: WhatsAppMessageType
  /** Seconds since our last message before it, when there is one. */
  secondsAfterOurMessage?: number
}): HeuristicVerdict {
  if (input.type !== "text") return "human"
  const text = normalize(input.body.trim())
  if (!text) return "human"

  if (looksLikeMenu(input.body)) return "automated"
  if (AUTOMATED_PATTERNS.some((pattern) => pattern.test(text))) {
    return "automated"
  }
  if (MAYBE_AUTOMATED_PATTERNS.some((pattern) => pattern.test(text))) {
    return "uncertain"
  }
  const fast =
    input.secondsAfterOurMessage !== undefined &&
    input.secondsAfterOurMessage <= FAST_REPLY_SECONDS
  if (fast && text.length >= LONG_REPLY_CHARS) return "uncertain"
  return "human"
}

// ---------------------------------------------------------------------------
// Conversation state
// ---------------------------------------------------------------------------

export type ConversationMessage = {
  fromMe: boolean
  timestamp: Date
  body: string
  autoReply?: AutoReplyVerdict
}

export type ConversationState = {
  /** Our latest message, if we ever wrote. */
  lastOutgoingAt?: Date
  /** A person answered after our latest message. */
  answered: boolean
  /** A message after our latest one still waits for Claude's verdict. */
  undecided: boolean
  /** Automatic replies after our latest message, oldest first. */
  autoReplies: string[]
}

/** Who spoke last, ignoring automatic replies. Messages oldest first. */
export function conversationState(
  messages: ConversationMessage[]
): ConversationState {
  let lastOutgoing = -1
  messages.forEach((message, index) => {
    if (message.fromMe) lastOutgoing = index
  })
  if (lastOutgoing < 0) {
    return { answered: false, undecided: false, autoReplies: [] }
  }

  const after = messages.slice(lastOutgoing + 1).filter((m) => !m.fromMe)
  return {
    lastOutgoingAt: messages[lastOutgoing].timestamp,
    answered: after.some(
      (message) =>
        message.autoReply !== "automated" && message.autoReply !== "pending"
    ),
    undecided: after.some((message) => message.autoReply === "pending"),
    autoReplies: after
      .filter((message) => message.autoReply === "automated")
      .map((message) => message.body),
  }
}

/**
 * Since our first message, the contact only sent automatic replies: a lead
 * that went to "Respondeu" on a greeting. Null when that is not the case;
 * otherwise the replies, oldest first.
 */
export function onlyAutomatedReplies(
  messages: ConversationMessage[]
): string[] | null {
  const first = messages.findIndex((message) => message.fromMe)
  if (first < 0) return null
  const replies = messages.slice(first + 1).filter((m) => !m.fromMe)
  if (replies.length === 0) return null
  if (!replies.every((message) => message.autoReply === "automated")) {
    return null
  }
  return replies.map((message) => message.body)
}

/** A person wrote after `since` (automatic replies do not count). */
export function answeredSince(
  messages: ConversationMessage[],
  since: Date
): boolean {
  return messages.some(
    (message) =>
      !message.fromMe &&
      message.timestamp > since &&
      message.autoReply !== "automated" &&
      message.autoReply !== "pending"
  )
}

/** We wrote again after `since`, other than the follow-up itself. */
export function wroteSince(
  messages: ConversationMessage[],
  since: Date
): boolean {
  return messages.some((message) => message.fromMe && message.timestamp > since)
}
