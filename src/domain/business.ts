import type { LeadApproach } from "@/domain/approach"
import type { PhoneType } from "@/domain/phone"
import type { PipelineEntry } from "@/domain/pipeline"

/**
 * Core domain definitions for a collected business/establishment.
 * Pure TypeScript: no Mongoose, no React, no I/O.
 */

export const OPERATIONAL_STATUS = [
  "OPERATIONAL",
  "CLOSED_TEMPORARILY",
  "CLOSED_PERMANENTLY",
] as const

export type OperationalStatus = (typeof OPERATIONAL_STATUS)[number]

export const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, string> = {
  OPERATIONAL: "Em atividade",
  CLOSED_TEMPORARILY: "Fechada temporariamente",
  CLOSED_PERMANENTLY: "Encerrou as atividades",
}

/** Short badge text; the full label goes in the tooltip. */
export const OPERATIONAL_STATUS_BADGES: Record<OperationalStatus, string> = {
  OPERATIONAL: "Ativa",
  CLOSED_TEMPORARILY: "Fechada temp.",
  CLOSED_PERMANENTLY: "Encerrada",
}

export const BUSINESS_STATUS = [
  "NEW",
  "ENRICHED",
  "ENRICHMENT_FAILED",
  "ARCHIVED",
] as const

export type BusinessStatus = (typeof BUSINESS_STATUS)[number]

export const BUSINESS_STATUS_LABELS: Record<BusinessStatus, string> = {
  NEW: "Novo",
  ENRICHED: "Enriquecido",
  ENRICHMENT_FAILED: "Falha no enriquecimento",
  ARCHIVED: "Arquivado",
}

export type BusinessAddress = {
  street?: string
  number?: string
  neighborhood?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  formatted?: string
}

export type BusinessLocation = {
  latitude?: number
  longitude?: number
}

export type BusinessSocial = {
  instagram?: string
  facebook?: string
  whatsapp?: string
  linkedin?: string
}

export type BusinessEnrichment = {
  enrichedAt?: Date
  emails: string[]
  socials: BusinessSocial
  websiteStatus?: number
  websiteTitle?: string
  /** The site exists but does not work; set by the enrichment. */
  websiteBroken?: boolean
  technologies: string[]
  error?: string
}

export type BusinessRegistryActivity = {
  code: string
  description?: string
}

export type BusinessRegistryPartner = {
  name: string
  /** Qualification in the partnership, e.g. "Sócio-Administrador". */
  role?: string
  /** ISO day (yyyy-mm-dd) the partner joined. */
  since?: string
}

/**
 * Company record from the Receita Federal, looked up by CNPJ. Dates are kept
 * as ISO days (yyyy-mm-dd): they carry no time, and parsing them as Date
 * would shift them a day back in Brazilian time zones.
 */
export type BusinessRegistry = {
  /** The CNPJ this record belongs to. */
  cnpj?: string
  fetchedAt?: Date
  legalName?: string
  tradeName?: string
  /** Registration status as the Receita names it: ATIVA, BAIXADA, INAPTA... */
  status?: string
  statusDate?: string
  openedAt?: string
  /** Company size (porte), e.g. "MICRO EMPRESA". */
  size?: string
  legalNature?: string
  mainActivity?: BusinessRegistryActivity
  secondaryActivities: BusinessRegistryActivity[]
  shareCapital?: number
  simples?: boolean
  mei?: boolean
  email?: string
  phones: string[]
  partners: BusinessRegistryPartner[]
  /** Why the last lookup failed; data from an earlier lookup is kept. */
  error?: string
}

export type Business = {
  id: string
  externalId: string
  source: string
  name: string
  /** Digits only (or uppercase alphanumerics, for the newer format). */
  cnpj?: string
  category?: string
  phone?: string
  /** Derived from `phone` when saved; see domain/phone. */
  phoneType?: PhoneType
  /** Country of the phone's country code (ISO alpha-2). */
  phoneCountry?: string
  website?: string
  rating?: number
  reviewsCount?: number
  /** Operational state reported by the source; absent when unknown. */
  operationalStatus?: OperationalStatus
  /** Canonical category id, stable regardless of display language. */
  primaryType?: string
  /** Link to the place's page on the source. */
  mapsUrl?: string
  address: BusinessAddress
  location: BusinessLocation
  enrichment: BusinessEnrichment
  /** Present once the CNPJ was looked up at the Receita. */
  registry?: BusinessRegistry
  /** Latest sales approach generated with Claude. */
  approach?: LeadApproach
  status: BusinessStatus
  searchIds: string[]
  /** Present only when the lead was added to the prospecting board. */
  pipeline?: PipelineEntry
  collectedAt: Date
  updatedAt: Date
}

/** A business counts as "having a website" only with a non-empty URL. */
export function hasWebsite(business: Pick<Business, "website">): boolean {
  return typeof business.website === "string" && business.website.length > 0
}

export function hasPhone(business: Pick<Business, "phone">): boolean {
  return typeof business.phone === "string" && business.phone.length > 0
}

export function hasInstagram(business: Pick<Business, "enrichment">): boolean {
  const handle = business.enrichment?.socials?.instagram
  return typeof handle === "string" && handle.length > 0
}

export function isEnriched(business: Pick<Business, "enrichment">): boolean {
  return Boolean(business.enrichment?.enrichedAt)
}

/** A permanently closed business is not worth prospecting. */
export function isClosed(
  business: Pick<Business, "operationalStatus">
): boolean {
  return (
    business.operationalStatus === "CLOSED_PERMANENTLY" ||
    business.operationalStatus === "CLOSED_TEMPORARILY"
  )
}
