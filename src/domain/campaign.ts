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
  GENERATING: "Gerando mensagens",
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

/** Ended campaigns that can be brought back. */
export function canReopenCampaign(status: CampaignStatus): boolean {
  return status === "DONE" || status === "CANCELLED"
}

/**
 * Reason given to leads skipped because their campaign was cancelled; a
 * reopen brings exactly these back, never leads the user skipped by hand.
 */
export const CANCELLED_ITEM_REASON = "Pulado porque a campanha foi cancelada."

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
  GENERATING: "Gerando mensagem",
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

/**
 * Default time zone of a campaign's send window, and the one the account-wide
 * daily limit counts days in, whatever the server says.
 */
export const CAMPAIGN_TIME_ZONE = "America/Sao_Paulo"

/** Time zones offered for the send window, with a label for the picker. */
export const SEND_TIME_ZONES: { value: string; label: string }[] = [
  { value: "America/Sao_Paulo", label: "Brasília" },
  { value: "America/Manaus", label: "Manaus" },
  { value: "America/Rio_Branco", label: "Rio Branco" },
  { value: "Europe/Lisbon", label: "Portugal" },
  { value: "Europe/Madrid", label: "Espanha" },
  { value: "Europe/London", label: "Reino Unido" },
  { value: "Europe/Dublin", label: "Irlanda" },
  { value: "Europe/Paris", label: "França" },
  { value: "Europe/Rome", label: "Itália" },
  { value: "Europe/Berlin", label: "Alemanha" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina" },
  { value: "America/Montevideo", label: "Uruguai" },
  { value: "America/Asuncion", label: "Paraguai" },
  { value: "America/Santiago", label: "Chile" },
  { value: "America/Bogota", label: "Colômbia" },
  { value: "America/Lima", label: "Peru" },
  { value: "America/Mexico_City", label: "México (Cidade do México)" },
  { value: "America/New_York", label: "EUA (Leste)" },
  { value: "America/Chicago", label: "EUA (Central)" },
  { value: "America/Denver", label: "EUA (Montanha)" },
  { value: "America/Los_Angeles", label: "EUA (Pacífico)" },
  { value: "America/Toronto", label: "Canadá (Leste)" },
  { value: "Africa/Luanda", label: "Angola" },
  { value: "Africa/Maputo", label: "Moçambique" },
]

/**
 * A lead country's time zone, for the default of a new campaign. Countries
 * with several zones map to the most populous one.
 */
const COUNTRY_TIME_ZONES: Record<string, string> = {
  BR: "America/Sao_Paulo",
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  FR: "Europe/Paris",
  IT: "Europe/Rome",
  DE: "Europe/Berlin",
  AR: "America/Argentina/Buenos_Aires",
  UY: "America/Montevideo",
  PY: "America/Asuncion",
  CL: "America/Santiago",
  CO: "America/Bogota",
  PE: "America/Lima",
  MX: "America/Mexico_City",
  US: "America/New_York",
  CA: "America/Toronto",
  AO: "Africa/Luanda",
  MZ: "Africa/Maputo",
}

/** The time zone most of the leads live in; Brasília when unknown. */
export function timeZoneForCountries(countries: string[]): string {
  const counts = new Map<string, number>()
  for (const country of countries) {
    const zone = COUNTRY_TIME_ZONES[country.toUpperCase()]
    if (zone) counts.set(zone, (counts.get(zone) ?? 0) + 1)
  }
  let best = CAMPAIGN_TIME_ZONE
  let bestCount = 0
  for (const [zone, count] of counts) {
    if (count > bestCount) {
      best = zone
      bestCount = count
    }
  }
  return best
}

/** Whether the runtime knows this IANA zone. */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

export type CampaignCounts = Record<CampaignItemStatus, number>

export type Campaign = {
  id: string
  name: string
  /**
   * The angle of this campaign's first messages (who it targets, what to
   * highlight, what to avoid), passed to Claude with every lead.
   */
  brief?: string
  status: CampaignStatus
  intervalMinutes: number
  window: SendWindow
  /** IANA zone the send window is read in: the leads' local time. */
  timeZone: string
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
