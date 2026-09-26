/**
 * Sales approach written by Claude for one lead. Pure types: the prompt and
 * the CLI call live in the service layer.
 */

export type ApproachObjection = {
  objection: string
  answer: string
}

export type LeadApproach = {
  generatedAt: Date
  /** Model alias the text was generated with, for traceability. */
  model?: string
  /** What the data says about the lead and where the opportunity is. */
  diagnosis: string
  /** The single concrete reason to talk now. */
  hook: string
  whatsapp: string
  emailSubject: string
  emailBody: string
  callScript: string
  /** Sent when the first message goes unanswered. */
  followUp: string
  objections: ApproachObjection[]
}

/** What the user sells; without it every approach reads the same. */
export type SellerProfile = {
  sellerName?: string
  offer?: string
  /** Free-form tone and style rules, e.g. "informal, sem emojis". */
  instructions?: string
}

export function hasOffer(profile: SellerProfile | null | undefined): boolean {
  return Boolean(profile?.offer?.trim())
}
