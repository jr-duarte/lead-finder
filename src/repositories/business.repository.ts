import type {
  PipelineStage as MongoosePipelineStage,
  QueryFilter,
} from "mongoose"
import { Types } from "mongoose"

import type { Business } from "@/domain/business"
import type { PipelineStage } from "@/domain/pipeline"
import { connectToDatabase } from "@/lib/mongoose"
import { BusinessModel, type BusinessDocument } from "@/models/business.model"
import type { BusinessFilters, Presence } from "@/schemas/business"

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type RawBusiness = BusinessDocument & { _id: Types.ObjectId; updatedAt?: Date }

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Presence filters are expressed as "field is a non-empty string" so that
 * missing, null and "" are all treated as absent.
 */
function presenceCondition(
  field: string,
  presence: Presence
): QueryFilter<BusinessDocument> | null {
  if (presence === "yes") {
    return { [field]: { $exists: true, $nin: [null, ""] } }
  }
  if (presence === "no") {
    return {
      $or: [
        { [field]: { $exists: false } },
        { [field]: null },
        { [field]: "" },
      ],
    }
  }
  return null
}

export function buildBusinessQuery(
  filters: Partial<BusinessFilters>
): QueryFilter<BusinessDocument> {
  const and: QueryFilter<BusinessDocument>[] = []

  if (filters.search) {
    const regex = new RegExp(escapeRegex(filters.search), "i")
    and.push({
      $or: [
        { name: regex },
        { category: regex },
        { "address.city": regex },
        { "address.formatted": regex },
      ],
    })
  }

  if (filters.category) {
    and.push({ category: filters.category })
  }

  if (filters.city) {
    and.push({ "address.city": filters.city })
  }

  if (filters.state) {
    and.push({ "address.state": filters.state })
  }

  if (typeof filters.minRating === "number") {
    and.push({ rating: { $gte: filters.minRating } })
  }

  if (typeof filters.minReviews === "number") {
    and.push({ reviewsCount: { $gte: filters.minReviews } })
  }

  const website = presenceCondition("website", filters.website ?? "any")
  if (website) and.push(website)

  const phone = presenceCondition("phone", filters.phone ?? "any")
  if (phone) and.push(phone)

  const instagram = presenceCondition(
    "enrichment.socials.instagram",
    filters.instagram ?? "any"
  )
  if (instagram) and.push(instagram)

  if (filters.status) {
    and.push({ status: filters.status })
  }

  if (filters.pipelineStage) {
    and.push({ "pipeline.stage": filters.pipelineStage })
  } else if (filters.pipeline === "in") {
    and.push({ pipeline: { $exists: true } })
  } else if (filters.pipeline === "out") {
    and.push({ pipeline: { $exists: false } })
  }

  // Closed businesses never convert, so they can be excluded from a view.
  if (filters.hideClosed) {
    and.push({
      operationalStatus: {
        $nin: ["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"],
      },
    })
  }

  if (filters.collectedFrom || filters.collectedTo) {
    const range: Record<string, Date> = {}
    if (filters.collectedFrom) range.$gte = new Date(filters.collectedFrom)
    if (filters.collectedTo) {
      const to = new Date(filters.collectedTo)
      to.setHours(23, 59, 59, 999)
      range.$lte = to
    }
    and.push({ collectedAt: range })
  }

  return and.length > 0 ? { $and: and } : {}
}

function toBusiness(raw: RawBusiness): Business {
  return {
    id: String(raw._id),
    externalId: raw.externalId,
    source: raw.source,
    name: raw.name,
    category: raw.category ?? undefined,
    phone: raw.phone ?? undefined,
    website: raw.website ?? undefined,
    rating: raw.rating ?? undefined,
    reviewsCount: raw.reviewsCount ?? 0,
    operationalStatus:
      (raw.operationalStatus as Business["operationalStatus"]) ?? undefined,
    primaryType: raw.primaryType ?? undefined,
    mapsUrl: raw.mapsUrl ?? undefined,
    address: {
      street: raw.address?.street ?? undefined,
      number: raw.address?.number ?? undefined,
      neighborhood: raw.address?.neighborhood ?? undefined,
      city: raw.address?.city ?? undefined,
      state: raw.address?.state ?? undefined,
      postalCode: raw.address?.postalCode ?? undefined,
      country: raw.address?.country ?? undefined,
      formatted: raw.address?.formatted ?? undefined,
    },
    location: {
      latitude: raw.location?.latitude ?? undefined,
      longitude: raw.location?.longitude ?? undefined,
    },
    enrichment: {
      enrichedAt: raw.enrichment?.enrichedAt ?? undefined,
      emails: raw.enrichment?.emails ?? [],
      socials: {
        instagram: raw.enrichment?.socials?.instagram ?? undefined,
        facebook: raw.enrichment?.socials?.facebook ?? undefined,
        whatsapp: raw.enrichment?.socials?.whatsapp ?? undefined,
        linkedin: raw.enrichment?.socials?.linkedin ?? undefined,
      },
      websiteStatus: raw.enrichment?.websiteStatus ?? undefined,
      websiteTitle: raw.enrichment?.websiteTitle ?? undefined,
      technologies: raw.enrichment?.technologies ?? [],
      error: raw.enrichment?.error ?? undefined,
    },
    status: raw.status,
    searchIds: (raw.searchIds ?? []).map(String),
    pipeline: raw.pipeline
      ? {
          stage: raw.pipeline.stage as PipelineStage,
          position: raw.pipeline.position ?? 0,
          enteredAt: raw.pipeline.enteredAt ?? new Date(),
          movedAt: raw.pipeline.movedAt ?? undefined,
          note: raw.pipeline.note ?? undefined,
        }
      : undefined,
    collectedAt: raw.collectedAt ?? new Date(),
    updatedAt: raw.updatedAt ?? new Date(),
  }
}

export const businessRepository = {
  async list(filters: BusinessFilters): Promise<Paginated<Business>> {
    await connectToDatabase()

    const query = buildBusinessQuery(filters)
    const sortField =
      filters.sortBy === "city" ? "address.city" : filters.sortBy
    const sort: Record<string, 1 | -1> = {
      [sortField]: filters.sortDir === "asc" ? 1 : -1,
    }

    const [items, total] = await Promise.all([
      BusinessModel.find(query)
        .sort(sort)
        .skip((filters.page - 1) * filters.pageSize)
        .limit(filters.pageSize)
        .lean<RawBusiness[]>()
        .exec(),
      BusinessModel.countDocuments(query).exec(),
    ])

    return {
      items: items.map(toBusiness),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    }
  },

  /**
   * Creates a lead entered by hand. The external id is generated locally so
   * it never collides with ids coming from a collection source.
   */
  async create(input: Record<string, unknown>): Promise<Business> {
    await connectToDatabase()

    const created = await BusinessModel.create({
      ...input,
      source: "manual",
      externalId: `manual-${new Types.ObjectId().toString()}`,
      collectedAt: new Date(),
      status: "NEW",
    })

    return toBusiness(created.toObject() as RawBusiness)
  },

  async findById(id: string): Promise<Business | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null

    const raw = await BusinessModel.findById(id).lean<RawBusiness>().exec()
    return raw ? toBusiness(raw) : null
  },

  async findManyByIds(ids: string[]): Promise<Business[]> {
    await connectToDatabase()
    const valid = ids.filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return []

    const raw = await BusinessModel.find({ _id: { $in: valid } })
      .lean<RawBusiness[]>()
      .exec()
    return raw.map(toBusiness)
  },

  /**
   * Fields set to `undefined` are removed via $unset rather than ignored, so a
   * re-run genuinely clears values that no longer apply (for example a stale
   * enrichment error after a later success).
   */
  async update(
    id: string,
    patch: Record<string, unknown>
  ): Promise<Business | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null

    const $set: Record<string, unknown> = {}
    const $unset: Record<string, ""> = {}

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        $unset[key] = ""
      } else {
        $set[key] = value
      }
    }

    const update: Record<string, unknown> = {}
    if (Object.keys($set).length > 0) update.$set = $set
    if (Object.keys($unset).length > 0) update.$unset = $unset

    const raw = await BusinessModel.findByIdAndUpdate(id, update, {
      returnDocument: "after",
    })
      .lean<RawBusiness>()
      .exec()

    return raw ? toBusiness(raw) : null
  },

  async deleteMany(ids: string[]): Promise<number> {
    await connectToDatabase()
    const valid = ids.filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return 0

    const result = await BusinessModel.deleteMany({
      _id: { $in: valid },
    }).exec()
    return result.deletedCount ?? 0
  },

  /** Distinct non-empty values for a field, used to populate filter combos. */
  async distinctValues(field: string): Promise<string[]> {
    await connectToDatabase()
    const values = await BusinessModel.distinct(field, {
      [field]: { $nin: [null, ""] },
    }).exec()

    return (values as unknown[])
      .filter(
        (value): value is string => typeof value === "string" && value !== ""
      )
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
  },

  async stats() {
    await connectToDatabase()

    const nonEmpty = (field: string) => ({
      $and: [
        { $ne: [{ $ifNull: [`$${field}`, ""] }, ""] },
        { $ne: [`$${field}`, null] },
      ],
    })

    const pipeline: MongoosePipelineStage[] = [
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withWebsite: { $sum: { $cond: [nonEmpty("website"), 1, 0] } },
          withPhone: { $sum: { $cond: [nonEmpty("phone"), 1, 0] } },
          withInstagram: {
            $sum: {
              $cond: [nonEmpty("enrichment.socials.instagram"), 1, 0],
            },
          },
          // "Attempted" counts every processed business; "enriched" counts
          // only those that actually yielded data, so a page of failures does
          // not read as success.
          attempted: {
            $sum: {
              $cond: [
                { $ne: [{ $ifNull: ["$enrichment.enrichedAt", null] }, null] },
                1,
                0,
              ],
            },
          },
          enriched: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $ne: [
                        { $ifNull: ["$enrichment.enrichedAt", null] },
                        null,
                      ],
                    },
                    { $ne: [{ $ifNull: ["$enrichment.error", null] }, null] },
                  ],
                },
                0,
                {
                  $cond: [
                    {
                      $ne: [
                        { $ifNull: ["$enrichment.enrichedAt", null] },
                        null,
                      ],
                    },
                    1,
                    0,
                  ],
                },
              ],
            },
          },
          enrichmentFailed: {
            $sum: {
              $cond: [{ $eq: ["$status", "ENRICHMENT_FAILED"] }, 1, 0],
            },
          },
          avgRating: { $avg: "$rating" },
        },
      },
    ]

    const [result] = await BusinessModel.aggregate(pipeline).exec()

    const total = result?.total ?? 0
    const withWebsite = result?.withWebsite ?? 0

    return {
      total,
      withWebsite,
      withoutWebsite: total - withWebsite,
      withPhone: result?.withPhone ?? 0,
      withInstagram: result?.withInstagram ?? 0,
      enriched: result?.enriched ?? 0,
      attempted: result?.attempted ?? 0,
      enrichmentFailed: result?.enrichmentFailed ?? 0,
      avgRating: result?.avgRating ?? 0,
    }
  },

  /** Top categories by count, for the dashboard breakdown. */
  async topCategories(limit = 8) {
    await connectToDatabase()

    const rows = await BusinessModel.aggregate<{ _id: string; count: number }>([
      { $match: { category: { $nin: [null, ""] } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]).exec()

    return rows.map((row) => ({ category: row._id, count: row.count }))
  },

  /** Collection volume per day over the last N days. */
  async collectionTimeline(days = 14) {
    await connectToDatabase()

    const since = new Date()
    since.setDate(since.getDate() - (days - 1))
    since.setHours(0, 0, 0, 0)

    const rows = await BusinessModel.aggregate<{ _id: string; count: number }>([
      { $match: { collectedAt: { $gte: since } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$collectedAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec()

    const counts = new Map(rows.map((row) => [row._id, row.count]))
    const timeline: { date: string; count: number }[] = []

    for (let index = 0; index < days; index += 1) {
      const date = new Date(since)
      date.setDate(since.getDate() + index)
      const key = date.toISOString().slice(0, 10)
      timeline.push({ date: key, count: counts.get(key) ?? 0 })
    }

    return timeline
  },
}

export { toBusiness }
