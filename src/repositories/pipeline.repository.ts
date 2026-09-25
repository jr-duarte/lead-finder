import { Types } from "mongoose"

import type { Business } from "@/domain/business"
import type { PipelineStage } from "@/domain/pipeline"
import { connectToDatabase } from "@/lib/mongoose"
import { BusinessModel } from "@/models/business.model"
import { toBusiness } from "@/repositories/business.repository"

type RawBusiness = Parameters<typeof toBusiness>[0]

export const pipelineRepository = {
  /** Every lead currently on the board, ordered for rendering. */
  async board(): Promise<Business[]> {
    await connectToDatabase()

    const raw = await BusinessModel.find({ pipeline: { $exists: true } })
      .sort({ "pipeline.stage": 1, "pipeline.position": 1 })
      .lean<RawBusiness[]>()
      .exec()

    return raw.map(toBusiness)
  },

  /** Highest position in a column, used to append new cards at the end. */
  async lastPosition(stage: PipelineStage): Promise<number> {
    await connectToDatabase()

    const last = await BusinessModel.findOne({ "pipeline.stage": stage })
      .sort({ "pipeline.position": -1 })
      .select("pipeline.position")
      .lean<{ pipeline?: { position?: number } }>()
      .exec()

    return last?.pipeline?.position ?? -1
  },

  /** Adds leads to a column, skipping any already on the board. */
  async add(ids: string[], stage: PipelineStage): Promise<number> {
    await connectToDatabase()

    const valid = ids.filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return 0

    const fresh = await BusinessModel.find({
      _id: { $in: valid },
      pipeline: { $exists: false },
    })
      .select("_id")
      .lean<{ _id: Types.ObjectId }[]>()
      .exec()

    if (fresh.length === 0) return 0

    let position = (await this.lastPosition(stage)) + 1
    const now = new Date()

    await BusinessModel.bulkWrite(
      fresh.map((doc) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              pipeline: { stage, position: position++, enteredAt: now },
            },
          },
        },
      }))
    )

    return fresh.length
  },

  /**
   * Moves a card to a stage and index, shifting the cards below it down so
   * positions stay unique within the column.
   */
  async move(
    id: string,
    stage: PipelineStage,
    position?: number
  ): Promise<Business | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null

    const target = position ?? (await this.lastPosition(stage)) + 1

    await BusinessModel.updateMany(
      {
        _id: { $ne: id },
        "pipeline.stage": stage,
        "pipeline.position": { $gte: target },
      },
      { $inc: { "pipeline.position": 1 } }
    ).exec()

    const raw = await BusinessModel.findByIdAndUpdate(
      id,
      {
        $set: {
          "pipeline.stage": stage,
          "pipeline.position": target,
          "pipeline.movedAt": new Date(),
        },
      },
      { returnDocument: "after" }
    )
      .lean<RawBusiness>()
      .exec()

    return raw ? toBusiness(raw) : null
  },

  async setNote(id: string, note: string): Promise<Business | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null

    const raw = await BusinessModel.findByIdAndUpdate(
      id,
      note
        ? { $set: { "pipeline.note": note } }
        : { $unset: { "pipeline.note": "" } },
      { returnDocument: "after" }
    )
      .lean<RawBusiness>()
      .exec()

    return raw ? toBusiness(raw) : null
  },

  /** Removes leads from the board without deleting the businesses. */
  async remove(ids: string[]): Promise<number> {
    await connectToDatabase()

    const valid = ids.filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return 0

    const result = await BusinessModel.updateMany(
      { _id: { $in: valid } },
      { $unset: { pipeline: "" } }
    ).exec()

    return result.modifiedCount ?? 0
  },

  async countByStage(): Promise<Record<string, number>> {
    await connectToDatabase()

    const rows = await BusinessModel.aggregate<{ _id: string; count: number }>([
      { $match: { pipeline: { $exists: true } } },
      { $group: { _id: "$pipeline.stage", count: { $sum: 1 } } },
    ]).exec()

    return Object.fromEntries(rows.map((row) => [row._id, row.count]))
  },
}
