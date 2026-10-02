import type { PipelineStage } from "@/domain/pipeline"

/**
 * Prospecting campaigns: a list of new leads that get their first WhatsApp
 * message one at a time, at a controlled pace. Pure TypeScript: no I/O.
 */

export const CAMPAIGN_STATUS = [
  "GENERATING",
  "REVIEW",
  "RUNNING",
  "PAUSED",
  "DONE",
  "CANCELLED",
] as const

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number]

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  GENERATING: "Gerando abordagens",
  REVIEW: "Aguardando aprovação",
  RUNNING: "Enviando",
  PAUSED: "Pausada",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
}

/** Campaigns that still accept leads and may still send. */
export const OPEN_CAMPAIGN_STATUSES: CampaignStatus[] = [
  "GENERATING",
  "REVIEW",
  "RUNNING",
  "PAUSED",
]

export function isCampaignOpen(status: CampaignStatus): boolean {
  return OPEN_CAMPAIGN_STATUSES.includes(status)
}

export const CAMPAIGN_ITEM_STATUS = [
  /** Waiting for its approach to be written. */
  "PENDING",
  "GENERATING",
  /** Message ready, waiting for the user's approval. */
  "READY",
  /** In the send queue. */
  "APPROVED",
  "SENDING",
  "SENT",
  /** Answered after our message. */
  "REPLIED",
  /** Left out by the user. */
  "SKIPPED",
  /** Cannot be contacted: no WhatsApp, already contacted... (see reason). */
  "INELIGIBLE",
  "FAILED",
] as const

export type CampaignItemStatus = (typeof CAMPAIGN_ITEM_STATUS)[number]

export const CAMPAIGN_ITEM_STATUS_LABELS: Record<CampaignItemStatus, string> = {
  PENDING: "Na fila para gerar",
  GENERATING: "Gerando abordagem",
  READY: "Aguardando aprovação",
  APPROVED: "Na fila de envio",
  SENDING: "Enviando",
  SENT: "Enviada",
  REPLIED: "Respondeu",
  SKIPPED: "Pulado",
  INELIGIBLE: "Fora da campanha",
  FAILED: "Falhou",
}

/** Items that will not change any more. */
export const FINAL_ITEM_STATUSES: CampaignItemStatus[] = [
  "SENT",
  "REPLIED",
  "SKIPPED",
  "INELIGIBLE",
  "FAILED",
]

/**
 * When messages may go out: weekdays (0 = Sunday) and an hour range,
 * `startHour` inclusive and `endHour` exclusive, in the campaign time zone.
 */
export type SendWindow = {
  days: number[]
  startHour: number
  endHour: number
}

export const DEFAULT_SEND_WINDOW: SendWindow = {
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
}

/** All schedules are read in Brazilian time, whatever the server says. */
export const CAMPAIGN_TIME_ZONE = "America/Sao_Paulo"

export type CampaignCounts = Record<CampaignItemStatus, number>

export type Campaign = {
  id: string
  name: string
  status: CampaignStatus
  intervalMinutes: number
  window: SendWindow
  /** Nothing is sent before this moment. */
  startAt?: Date
  /** When the next message is due; set while running. */
  nextSendAt?: Date
  lastSentAt?: Date
  /** Why it is paused, or why it is waiting (daily limit, outside hours). */
  pauseReason?: string
  waitReason?: string
  consecutiveFailures: number
  counts: CampaignCounts
  createdAt: Date
  updatedAt: Date
}

export type CampaignItem = {
  id: string
  campaignId: string
  businessId: string
  /** Denormalized so the list needs no join. */
  businessName: string
  message?: string
  status: CampaignItemStatus
  /** Why it was left out or failed, in words for the user. */
  reason?: string
  conversationId?: string
  sentAt?: Date
  position: number
  createdAt: Date
  updatedAt: Date
}

export function emptyCounts(): CampaignCounts {
  return Object.fromEntries(
    CAMPAIGN_ITEM_STATUS.map((status) => [status, 0])
  ) as CampaignCounts
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export type EligibilityInput = {
  stage?: PipelineStage | null
  hasPhone: boolean
  /** The lead already has a WhatsApp conversation with messages. */
  hasConversation: boolean
  /** Name of another open campaign the lead is in. */
  openCampaignName?: string
}

/**
 * Only leads never contacted take part: off the board or still "Novo", no
 * WhatsApp conversation, and not queued in another campaign. Returns the
 * reason a lead is left out, or null when it may join.
 */
export function ineligibilityReason(input: EligibilityInput): string | null {
  if (input.openCampaignName) {
    return `Já está na campanha "${input.openCampaignName}".`
  }
  if (input.stage && input.stage !== "NEW") return "Lead já foi contatado."
  if (input.hasConversation) return "Já existe conversa no WhatsApp."
  if (!input.hasPhone) return "Sem telefone cadastrado."
  return null
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** Weekday, hour and calendar day of a moment in the campaign time zone. */
export function zonedParts(
  date: Date,
  timeZone = CAMPAIGN_TIME_ZONE
): { weekday: number; hour: number; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value
  return {
    weekday: weekdayIndex[get("weekday") ?? "Sun"] ?? 0,
    hour: Number(get("hour")),
    day: `${get("year")}-${get("month")}-${get("day")}`,
  }
}

export function isWithinWindow(
  date: Date,
  window: SendWindow,
  timeZone = CAMPAIGN_TIME_ZONE
): boolean {
  const { weekday, hour } = zonedParts(date, timeZone)
  return (
    window.days.includes(weekday) &&
    hour >= window.startHour &&
    hour < window.endHour
  )
}

const HOUR_MS = 60 * 60 * 1000

/**
 * The first moment at or after `from` inside the window. Window edges are
 * whole hours, so checking hour by hour lands exactly on the next opening.
 * Returns null for a window that never opens.
 */
export function nextWindowStart(
  from: Date,
  window: SendWindow,
  timeZone = CAMPAIGN_TIME_ZONE
): Date | null {
  if (isWithinWindow(from, window, timeZone)) return from

  let candidate = new Date(Math.ceil(from.getTime() / HOUR_MS) * HOUR_MS)
  for (let step = 0; step < 24 * 8; step += 1) {
    if (isWithinWindow(candidate, window, timeZone)) return candidate
    candidate = new Date(candidate.getTime() + HOUR_MS)
  }
  return null
}

/**
 * The start of the next calendar day in the campaign time zone, used once
 * the daily limit is reached. Found by stepping hours until the date changes.
 */
export function startOfNextDay(
  from: Date,
  timeZone = CAMPAIGN_TIME_ZONE
): Date {
  const today = zonedParts(from, timeZone).day
  let candidate = new Date(Math.ceil(from.getTime() / HOUR_MS) * HOUR_MS)
  while (zonedParts(candidate, timeZone).day === today) {
    candidate = new Date(candidate.getTime() + HOUR_MS)
  }
  return candidate
}

/**
 * Delay until the next message: the interval varied by ±jitter, so sends
 * never land on an exact, robot-like rhythm. `random` is injectable for tests.
 */
export function jitteredIntervalMs(
  intervalMinutes: number,
  jitterPercent: number,
  random: () => number = Math.random
): number {
  const base = intervalMinutes * 60 * 1000
  const spread = (Math.max(0, Math.min(90, jitterPercent)) / 100) * base
  return Math.round(base - spread + random() * spread * 2)
}

/** Midnight of the current day in the campaign time zone (daily limit). */
export function startOfDay(from: Date, timeZone = CAMPAIGN_TIME_ZONE): Date {
  // Brazil has no daylight saving, so a day is always 24 hours long.
  return startOfNextDay(new Date(from.getTime() - 24 * HOUR_MS), timeZone)
}
