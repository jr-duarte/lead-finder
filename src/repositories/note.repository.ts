import { Types } from "mongoose"

import type { Note } from "@/domain/note"
import type { PipelineStage } from "@/domain/pipeline"
import { connectToDatabase } from "@/lib/mongoose"
import { BusinessModel } from "@/models/business.model"
import { NoteModel, type NoteDocument } from "@/models/note.model"

type RawNote = NoteDocument & {
  _id: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

function toNote(raw: RawNote): Note {
  return {
    id: String(raw._id),
    businessId: String(raw.businessId),
    content: raw.content,
    stage: raw.stage ?? undefined,
    createdAt: raw.createdAt ?? new Date(),
    updatedAt: raw.updatedAt ?? new Date(),
  }
}

export const noteRepository = {
  /** Notes for a lead, newest first. */
  async listByBusiness(businessId: string): Promise<Note[]> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(businessId)) return []

    const raw = await NoteModel.find({ businessId })
      .sort({ createdAt: -1 })
      .lean<RawNote[]>()
      .exec()

    return raw.map(toNote)
  },

  async create(businessId: string, content: string): Promise<Note | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(businessId)) return null

    // The stage is captured now so the note keeps its context later.
    const business = await BusinessModel.findById(businessId)
      .select("pipeline.stage")
      .lean<{ pipeline?: { stage?: PipelineStage } }>()
      .exec()

    if (!business) return null

    const created = await NoteModel.create({
      businessId,
      content,
      stage: business.pipeline?.stage,
    })

    return toNote(created.toObject() as RawNote)
  },

  async update(id: string, content: string): Promise<Note | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null

    const raw = await NoteModel.findByIdAndUpdate(
      id,
      { $set: { content } },
      { returnDocument: "after" }
    )
      .lean<RawNote>()
      .exec()

    return raw ? toNote(raw) : null
  },

  async remove(id: string): Promise<boolean> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return false

    const result = await NoteModel.deleteOne({ _id: id }).exec()
    return (result.deletedCount ?? 0) > 0
  },

  /** Removes every note of a business, used when the business is deleted. */
  async removeByBusiness(businessIds: string[]): Promise<number> {
    await connectToDatabase()
    const valid = businessIds.filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return 0

    const result = await NoteModel.deleteMany({
      businessId: { $in: valid },
    }).exec()

    return result.deletedCount ?? 0
  },
}
