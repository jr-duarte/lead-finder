import { Types } from "mongoose"

import {
  CAMPAIGN_ITEM_STATUS,
  DEFAULT_SEND_WINDOW,
  emptyCounts,
  OPEN_CAMPAIGN_STATUSES,
  type Campaign,
  type CampaignItem,
  type CampaignItemStatus,
  type CampaignStatus,
  type SendWindow,
} from "@/domain/campaign"
import { connectToDatabase } from "@/lib/mongoose"
import {
  CampaignItemModel,
  type CampaignItemDocument,
} from "@/models/campaign-item.model"
import { CampaignModel, type CampaignDocument } from "@/models/campaign.model"

type RawCampaign = CampaignDocument & {
  _id: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

type RawItem = CampaignItemDocument & {
  _id: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

function toWindow(raw?: Partial<SendWindow> | null): SendWindow {
  return {
    days: raw?.days?.length ? [...raw.days] : DEFAULT_SEND_WINDOW.days,
    startHour: raw?.startHour ?? DEFAULT_SEND_WINDOW.startHour,
    endHour: raw?.endHour ?? DEFAULT_SEND_WINDOW.endHour,
  }
}

function toCampaign(raw: RawCampaign, counts = emptyCounts()): Campaign {
  return {
    id: String(raw._id),
    name: raw.name,
    status: raw.status as CampaignStatus,
    intervalMinutes: raw.intervalMinutes,
    window: toWindow(raw.window),
    startAt: raw.startAt ?? undefined,
    nextSendAt: raw.nextSendAt ?? undefined,
    lastSentAt: raw.lastSentAt ?? undefined,
    pauseReason: raw.pauseReason ?? undefined,
    waitReason: raw.waitReason ?? undefined,
    consecutiveFailures: raw.consecutiveFailures ?? 0,
    counts,
    createdAt: raw.createdAt ?? new Date(),
    updatedAt: raw.updatedAt ?? new Date(),
  }
}

function toItem(raw: RawItem): CampaignItem {
  return {
    id: String(raw._id),
    campaignId: String(raw.campaignId),
    businessId: String(raw.businessId),
    businessName: raw.businessName,
    message: raw.message ?? undefined,
    status: raw.status as CampaignItemStatus,
    reason: raw.reason ?? undefined,
    conversationId: raw.conversationId ? String(raw.conversationId) : undefined,
    sentAt: raw.sentAt ?? undefined,
    position: raw.position,
    createdAt: raw.createdAt ?? new Date(),
    updatedAt: raw.updatedAt ?? new Date(),
  }
}

/** `$set` for the given fields and `$unset` for the ones set to undefined. */
function setUnset(patch: Record<string, unknown>) {
  const $set: Record<string, unknown> = {}
  const $unset: Record<string, 1> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) $unset[key] = 1
    else $set[key] = value
  }
  return { $set, ...(Object.keys($unset).length ? { $unset } : {}) }
}

async function countsFor(
  campaignIds: Types.ObjectId[]
): Promise<Map<string, ReturnType<typeof emptyCounts>>> {
  const rows = await CampaignItemModel.aggregate<{
    _id: { campaignId: Types.ObjectId; status: CampaignItemStatus }
    count: number
  }>([
    { $match: { campaignId: { $in: campaignIds } } },
    {
      $group: {
        _id: { campaignId: "$campaignId", status: "$status" },
        count: { $sum: 1 },
      },
    },
  ])

  const result = new Map<string, ReturnType<typeof emptyCounts>>()
  for (const row of rows) {
    const key = String(row._id.campaignId)
    const counts = result.get(key) ?? emptyCounts()
    if (CAMPAIGN_ITEM_STATUS.includes(row._id.status)) {
      counts[row._id.status] = row.count
    }
    result.set(key, counts)
  }
  return result
}

export type CampaignPatch = Partial<
  Pick<
    Campaign,
    | "name"
    | "status"
    | "intervalMinutes"
    | "window"
    | "startAt"
    | "nextSendAt"
    | "lastSentAt"
    | "pauseReason"
    | "waitReason"
    | "consecutiveFailures"
  >
>

export type ItemPatch = Partial<
  Pick<
    CampaignItem,
    "message" | "status" | "reason" | "conversationId" | "sentAt"
  >
>

export const campaignRepository = {
  async create(input: {
    name: string
    intervalMinutes: number
    window: SendWindow
    startAt?: Date
  }): Promise<Campaign> {
    await connectToDatabase()
    const created = await CampaignModel.create({
      ...input,
      status: "GENERATING",
    })
    return toCampaign(created.toObject() as RawCampaign)
  },

  async findById(id: string): Promise<Campaign | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null
    const raw = await CampaignModel.findById(id).lean<RawCampaign>().exec()
    if (!raw) return null
    const counts = await countsFor([raw._id])
    return toCampaign(raw, counts.get(String(raw._id)))
  },

  async list(): Promise<Campaign[]> {
    await connectToDatabase()
    const raw = await CampaignModel.find()
      .sort({ createdAt: -1 })
      .lean<RawCampaign[]>()
      .exec()
    const counts = await countsFor(raw.map((item) => item._id))
    return raw.map((item) => toCampaign(item, counts.get(String(item._id))))
  },

  async listByStatus(statuses: CampaignStatus[]): Promise<Campaign[]> {
    await connectToDatabase()
    const raw = await CampaignModel.find({ status: { $in: statuses } })
      .sort({ nextSendAt: 1, createdAt: 1 })
      .lean<RawCampaign[]>()
      .exec()
    return raw.map((item) => toCampaign(item))
  },

  async update(id: string, patch: CampaignPatch): Promise<void> {
    await connectToDatabase()
    await CampaignModel.updateOne({ _id: id }, setUnset(patch)).exec()
  },

  /** Changes the status only if it is still one of `from` (no races). */
  async transition(
    id: string,
    from: CampaignStatus[],
    patch: CampaignPatch & { status: CampaignStatus }
  ): Promise<boolean> {
    await connectToDatabase()
    const result = await CampaignModel.updateOne(
      { _id: id, status: { $in: from } },
      setUnset(patch)
    ).exec()
    return result.modifiedCount > 0
  },

  // -------------------------------------------------------------------------
  // Items
  // -------------------------------------------------------------------------

  /** Appends leads at the end of the queue; ones already there are ignored. */
  async addItems(
    campaignId: string,
    leads: {
      businessId: string
      businessName: string
      status?: CampaignItemStatus
      reason?: string
    }[]
  ): Promise<number> {
    await connectToDatabase()
    if (leads.length === 0) return 0

    const last = await CampaignItemModel.findOne({ campaignId })
      .sort({ position: -1 })
      .select("position")
      .lean<{ position: number }>()
      .exec()
    let position = (last?.position ?? -1) + 1

    const result = await CampaignItemModel.bulkWrite(
      leads.map((lead) => ({
        updateOne: {
          filter: {
            campaignId: new Types.ObjectId(campaignId),
            businessId: new Types.ObjectId(lead.businessId),
          },
          update: {
            $setOnInsert: {
              campaignId: new Types.ObjectId(campaignId),
              businessId: new Types.ObjectId(lead.businessId),
              businessName: lead.businessName,
              status: lead.status ?? "PENDING",
              ...(lead.reason ? { reason: lead.reason } : {}),
              position: position++,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false, throwOnValidationError: true }
    )
    return result.upsertedCount
  },

  async listItems(campaignId: string): Promise<CampaignItem[]> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(campaignId)) return []
    const raw = await CampaignItemModel.find({ campaignId })
      .sort({ position: 1 })
      .lean<RawItem[]>()
      .exec()
    return raw.map(toItem)
  },

  async findItem(
    campaignId: string,
    itemId: string
  ): Promise<CampaignItem | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(itemId)) return null
    const raw = await CampaignItemModel.findOne({ _id: itemId, campaignId })
      .lean<RawItem>()
      .exec()
    return raw ? toItem(raw) : null
  },

  async updateItem(itemId: string, patch: ItemPatch): Promise<void> {
    await connectToDatabase()
    const { conversationId, ...rest } = patch
    await CampaignItemModel.updateOne(
      { _id: itemId },
      setUnset({
        ...rest,
        ...(conversationId !== undefined
          ? { conversationId: new Types.ObjectId(conversationId) }
          : {}),
      })
    ).exec()
  },

  /** Moves items from one status to another, e.g. "approve all". */
  async transitionItems(
    campaignId: string,
    from: CampaignItemStatus[],
    to: CampaignItemStatus
  ): Promise<number> {
    await connectToDatabase()
    const result = await CampaignItemModel.updateMany(
      { campaignId, status: { $in: from } },
      { $set: { status: to } }
    ).exec()
    return result.modifiedCount
  },

  /**
   * Takes one item and marks it as being worked on, atomically: only one
   * caller can ever get a given item. This is what guarantees a lead never
   * receives the same first message twice.
   */
  async claimNext(
    scope: { campaignId: string } | { campaignIds: string[] },
    from: CampaignItemStatus,
    to: CampaignItemStatus
  ): Promise<CampaignItem | null> {
    await connectToDatabase()
    const campaignFilter =
      "campaignId" in scope
        ? { campaignId: new Types.ObjectId(scope.campaignId) }
        : {
            campaignId: {
              $in: scope.campaignIds.map((id) => new Types.ObjectId(id)),
            },
          }
    const raw = await CampaignItemModel.findOneAndUpdate(
      { status: from, ...campaignFilter },
      { $set: { status: to } },
      // Queue order: oldest campaign first, then the order inside it.
      { sort: { campaignId: 1, position: 1 }, returnDocument: "after" }
    )
      .lean<RawItem>()
      .exec()
    return raw ? toItem(raw) : null
  },

  async itemsWithStatus(status: CampaignItemStatus): Promise<CampaignItem[]> {
    await connectToDatabase()
    const raw = await CampaignItemModel.find({ status })
      .lean<RawItem[]>()
      .exec()
    return raw.map(toItem)
  },

  async countItems(
    campaignId: string,
    statuses: CampaignItemStatus[]
  ): Promise<number> {
    await connectToDatabase()
    return CampaignItemModel.countDocuments({
      campaignId,
      status: { $in: statuses },
    }).exec()
  },

  /** First contacts sent by any campaign since a moment (daily limit). */
  async countSentSince(since: Date): Promise<number> {
    await connectToDatabase()
    return CampaignItemModel.countDocuments({ sentAt: { $gte: since } }).exec()
  },

  /**
   * For each lead, the name of an open campaign it is still active in, so a
   * lead is never queued twice.
   */
  async openCampaignsOf(businessIds: string[]): Promise<Map<string, string>> {
    await connectToDatabase()
    const valid = businessIds.filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return new Map()

    const open = await CampaignModel.find({
      status: { $in: OPEN_CAMPAIGN_STATUSES },
    })
      .select("name")
      .lean<{ _id: Types.ObjectId; name: string }[]>()
      .exec()
    if (open.length === 0) return new Map()
    const names = new Map(open.map((item) => [String(item._id), item.name]))

    const items = await CampaignItemModel.find({
      businessId: { $in: valid.map((id) => new Types.ObjectId(id)) },
      campaignId: { $in: open.map((item) => item._id) },
      status: { $nin: ["SKIPPED", "INELIGIBLE", "FAILED"] },
    })
      .select("businessId campaignId")
      .lean<{ businessId: Types.ObjectId; campaignId: Types.ObjectId }[]>()
      .exec()

    return new Map(
      items.map((item) => [
        String(item.businessId),
        names.get(String(item.campaignId)) ?? "outra campanha",
      ])
    )
  },

  /** Sent items of these leads, to mark them as answered. */
  async markReplied(businessIds: string[]): Promise<string[]> {
    await connectToDatabase()
    const valid = businessIds.filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return []
    const items = await CampaignItemModel.find({
      businessId: { $in: valid.map((id) => new Types.ObjectId(id)) },
      status: "SENT",
    })
      .select("campaignId")
      .lean<{ _id: Types.ObjectId; campaignId: Types.ObjectId }[]>()
      .exec()
    if (items.length === 0) return []
    await CampaignItemModel.updateMany(
      { _id: { $in: items.map((item) => item._id) } },
      { $set: { status: "REPLIED" } }
    ).exec()
    return [...new Set(items.map((item) => String(item.campaignId)))]
  },
}
