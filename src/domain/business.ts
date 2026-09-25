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
  technologies: string[]
  error?: string
}

export type Business = {
  id: string
  externalId: string
  source: string
  name: string
  category?: string
  phone?: string
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
  status: BusinessStatus
  searchIds: string[]
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
