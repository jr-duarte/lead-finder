import { Types } from "mongoose"

import { CAMPAIGN_TIME_ZONE, DEFAULT_SEND_WINDOW } from "@/domain/campaign"
import {
  emptyFollowUpCounts,
  FOLLOW_UP_STATUS,
  type FollowUp,
  type FollowUpCounts,
  type FollowUpStatus,
} from "@/domain/follow-up"
import { connectToDatabase } from "@/lib/mongoose"
import { FollowUpModel, type FollowUpDocument } from "@/models/follow-up.model"

type RawFollowUp = FollowUpDocument & {
  _id: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

function toFollowUp(raw: RawFollowUp): FollowUp {
  return {
    id: String(raw._id),
    businessId: String(raw.businessId),
    businessName: raw.businessName,
    conversationId: String(raw.conversationId),
    campaignId: raw.campaignId ? String(raw.campaignId) : undefined,
    campaignName: raw.campaignName ?? undefined,
    anchorAt: raw.anchorAt,
    message: raw.message ?? undefined,
    status: raw.status as FollowUpStatus,
    reason: raw.reason ?? undefined,
    window: {
      days: raw.window?.days?.length
        ? [...raw.window.days]
        : DEFAULT_SEND_WINDOW.days,
      startHour: raw.window?.startHour ?? DEFAULT_SEND_WINDOW.startHour,
      endHour: raw.window?.endHour ?? DEFAULT_SEND_WINDOW.endHour,
    },
    timeZone: raw.timeZone ?? CAMPAIGN_TIME_ZONE,
    intervalMinutes: raw.intervalMinutes,
    autoReplies: raw.autoReplies ? [...raw.autoReplies] : [],
    sentAt: raw.sentAt ?? undefined,
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

export type FollowUpPatch = Partial<
  Pick<FollowUp, "message" | "status" | "reason" | "sentAt" | "autoReplies">
>

export type NewFollowUp = Pick<
  FollowUp,
  | "businessId"
  | "businessName"
  | "conversationId"
  | "campaignId"
  | "campaignName"
  | "anchorAt"
  | "window"
  | "timeZone"
  | "intervalMinutes"
  | "autoReplies"
>

export const followUpRepository = {
  /**
   * Creates a lead's follow-up unless it already has one. Returns null when
   * it did: a lead gets a single follow-up, ever.
   */
  async create(input: NewFollowUp): Promise<FollowUp | null> {
    await connectToDatabase()
    try {
      const created = await FollowUpModel.create({
        ...input,
        status: "PENDING",
      })
      return toFollowUp(created.toObject() as RawFollowUp)
    } catch (error) {
      // The unique index on the lead: someone else created it first.
      if ((error as { code?: number })?.code === 11000) return null
      throw error
    }
  },

  async findById(id: string): Promise<FollowUp | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null
    const raw = await FollowUpModel.findById(id).lean<RawFollowUp>().exec()
    return raw ? toFollowUp(raw) : null
  },

  /** Which of these leads already have a follow-up, of any status. */
  async businessesWithFollowUp(businessIds: string[]): Promise<Set<string>> {
    await connectToDatabase()
    const valid = businessIds.filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return new Set()
    const ids: Types.ObjectId[] = await FollowUpModel.distinct("businessId", {
      businessId: { $in: valid.map((id) => new Types.ObjectId(id)) },
    }).exec()
    return new Set(ids.map(String))
  },

  async listByStatus(statuses: FollowUpStatus[]): Promise<FollowUp[]> {
    await connectToDatabase()
    const raw = await FollowUpModel.find({ status: { $in: statuses } })
      .sort({ createdAt: 1 })
      .lean<RawFollowUp[]>()
      .exec()
    return raw.map(toFollowUp)
  },

  /** Every follow-up, newest first, for the page. */
  async list(limit = 500): Promise<FollowUp[]> {
    await connectToDatabase()
    const raw = await FollowUpModel.find()
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean<RawFollowUp[]>()
      .exec()
    return raw.map(toFollowUp)
  },

  async listByBusinesses(businessIds: string[]): Promise<FollowUp[]> {
    await connectToDatabase()
    const valid = businessIds.filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return []
    const raw = await FollowUpModel.find({
      businessId: { $in: valid.map((id) => new Types.ObjectId(id)) },
    })
      .lean<RawFollowUp[]>()
      .exec()
    return raw.map(toFollowUp)
  },

  async counts(): Promise<FollowUpCounts> {
    await connectToDatabase()
    const rows = await FollowUpModel.aggregate<{
      _id: FollowUpStatus
      count: number
    }>([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    const counts = emptyFollowUpCounts()
    for (const row of rows) {
      if (FOLLOW_UP_STATUS.includes(row._id)) counts[row._id] = row.count
    }
    return counts
  },

  async update(id: string, patch: FollowUpPatch): Promise<void> {
    await connectToDatabase()
    await FollowUpModel.updateOne({ _id: id }, setUnset(patch)).exec()
  },

  /**
   * Changes the status only if it is still one of `from`, so two passes
   * never act on the same follow-up. True when it changed.
   */
  async transition(
    id: string,
    from: FollowUpStatus[],
    patch: FollowUpPatch & { status: FollowUpStatus }
  ): Promise<boolean> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return false
    const result = await FollowUpModel.updateOne(
      { _id: id, status: { $in: from } },
      setUnset(patch)
    ).exec()
    return result.modifiedCount > 0
  },

  /** Moves every follow-up in `from` to `to`, e.g. "approve all". */
  async transitionAll(
    from: FollowUpStatus[],
    to: FollowUpStatus
  ): Promise<number> {
    await connectToDatabase()
    const result = await FollowUpModel.updateMany(
      { status: { $in: from } },
      { $set: { status: to }, $unset: { reason: 1 } }
    ).exec()
    return result.modifiedCount
  },

  /** Takes the oldest follow-up in `from` and marks it `to`, atomically. */
  async claimNext(
    from: FollowUpStatus,
    to: FollowUpStatus
  ): Promise<FollowUp | null> {
    await connectToDatabase()
    const raw = await FollowUpModel.findOneAndUpdate(
      { status: from },
      { $set: { status: to } },
      { sort: { createdAt: 1 }, returnDocument: "after" }
    )
      .lean<RawFollowUp>()
      .exec()
    return raw ? toFollowUp(raw) : null
  },

  /** The latest follow-up that went out, to keep the pace after a restart. */
  async lastSentAt(): Promise<Date | null> {
    await connectToDatabase()
    const raw = await FollowUpModel.findOne({ sentAt: { $exists: true } })
      .sort({ sentAt: -1 })
      .select("sentAt")
      .lean<{ sentAt?: Date }>()
      .exec()
    return raw?.sentAt ?? null
  },

  /** Drops the follow-ups of a conversation that no longer exists. */
  async cancelByConversation(
    conversationId: string,
    reason: string
  ): Promise<void> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(conversationId)) return
    await FollowUpModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        status: { $in: ["PENDING", "READY", "APPROVED", "FAILED"] },
      },
      { $set: { status: "CANCELLED", reason } }
    ).exec()
  },
}
