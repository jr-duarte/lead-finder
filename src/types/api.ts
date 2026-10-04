import type { Business } from "@/domain/business"
import type { Note } from "@/domain/note"
import type { EnrichmentJob } from "@/domain/enrichment-job"
import type { Search } from "@/domain/search"

/** Wire format: dates arrive as ISO strings over JSON. */
export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | undefined
      ? string | undefined
      : T[K] extends object
        ? Serialized<T[K]>
        : T[K]
}

export type BusinessDTO = Serialized<Business>
export type SearchDTO = Serialized<Search>

export type PaginatedDTO<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type FilterOptionsDTO = {
  categories: string[]
  cities: string[]
  states: string[]
  /** ISO alpha-2 codes. */
  countries: string[]
}

export type DashboardDTO = {
  kpis: {
    total: number
    withoutWebsite: number
    withWebsite: number
    enriched: number
    withPhone: number
    withInstagram: number
    totalSearches: number
  }
  funnel: {
    won: number
    lost: number
    inProgress: number
    total: number
    winRate: number
  }
  avgRating: number
  topCategories: { category: string; count: number }[]
  timeline: { date: string; count: number }[]
  recentSearches: SearchDTO[]
}

export type EnrichmentSummaryDTO = {
  requested: number
  processed: number
  succeeded: number
  failed: number
  skipped: number
}

export type EnrichmentStatsDTO = {
  total: number
  /** Processed and yielded data. */
  enriched: number
  /** Processed at all, including failures. */
  attempted: number
  failed: number
  withWebsite: number
  pending: number
}

export type EnrichmentJobDTO = Serialized<EnrichmentJob>

export type EnrichmentJobsDTO = {
  active: EnrichmentJobDTO | null
  recent: EnrichmentJobDTO[]
}

export type SourceInfoDTO = {
  source: "mock" | "osm" | "google"
  label: string
  maxResults: number
  requiresCoordinates: boolean
  hasRatings: boolean
}

export type BoardColumnDTO = {
  stage: import("@/domain/pipeline").PipelineStage
  label: string
  cards: BusinessDTO[]
}

export type BoardDTO = { columns: BoardColumnDTO[] }

export type NoteDTO = Serialized<Note>
export type NotesDTO = { notes: NoteDTO[] }

export type WhatsAppSnapshotDTO = Serialized<
  import("@/services/whatsapp/session.service").WhatsAppSnapshot
>
export type WhatsAppConversationDTO = Serialized<
  import("@/domain/whatsapp").WhatsAppConversation
>
export type WhatsAppContactDTO = Serialized<
  import("@/domain/whatsapp").WhatsAppContact
>
export type WhatsAppMessageDTO = Serialized<
  import("@/domain/whatsapp").WhatsAppMessage
>
export type WhatsAppConversationDetailDTO = {
  conversation: WhatsAppConversationDTO
  contact: WhatsAppContactDTO | null
  lead: import("@/services/whatsapp/conversation.service").LeadSummary | null
}
export type WhatsAppMessagesPageDTO = {
  items: WhatsAppMessageDTO[]
  /** Pass as `before` to load the next, older page; null at the start. */
  nextCursor: string | null
}

export type CampaignDTO = Serialized<import("@/domain/campaign").Campaign>
export type CampaignItemDTO = Serialized<
  import("@/domain/campaign").CampaignItem
>
export type CampaignDetailDTO = {
  campaign: CampaignDTO
  items: CampaignItemDTO[]
  /** First contacts per day allowed for the whole account. */
  dailyLimit: number
}
export type CampaignLeadCheckDTO = {
  businessId: string
  name: string
  reason: string | null
}
export type AddLeadsResultDTO = {
  added: number
  rejected: CampaignLeadCheckDTO[]
}
export type CampaignCreateResultDTO = AddLeadsResultDTO & {
  campaign: CampaignDTO
}

export type FollowUpDTO = Serialized<import("@/domain/follow-up").FollowUp>
export type FollowUpListDTO = {
  followUps: FollowUpDTO[]
  counts: import("@/domain/follow-up").FollowUpCounts
}
export type AutoReplyReviewItemDTO =
  import("@/services/follow-up/follow-up.service").AutoReplyReviewItem
