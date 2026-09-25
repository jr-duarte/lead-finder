import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

import { PIPELINE_STAGES } from "@/domain/pipeline"

const noteSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    /**
     * Snapshot of the funnel stage at writing time, so the history still makes
     * sense after the lead moves on.
     */
    stage: { type: String, enum: PIPELINE_STAGES },
  },
  { timestamps: true, collection: "notes" }
)

noteSchema.index({ businessId: 1, createdAt: -1 })

export type NoteDocument = InferSchemaType<typeof noteSchema>

export const NoteModel: Model<NoteDocument> =
  (models.Note as Model<NoteDocument>) ??
  model<NoteDocument>("Note", noteSchema)
