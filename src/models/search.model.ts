import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

import { SEARCH_STATUS } from "@/domain/search"

const paramsSchema = new Schema(
  {
    category: { type: String, required: true },
    location: { type: String, required: true },
    latitude: { type: Number },
    longitude: { type: Number },
    radiusMeters: { type: Number, required: true },
    limit: { type: Number, required: true },
  },
  { _id: false }
)

const statsSchema = new Schema(
  {
    found: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    duplicated: { type: Number, default: 0 },
  },
  { _id: false }
)

const searchSchema = new Schema(
  {
    code: { type: Number, required: true, unique: true },
    params: { type: paramsSchema, required: true },
    status: {
      type: String,
      enum: SEARCH_STATUS,
      default: "PENDING",
      index: true,
    },
    stats: { type: statsSchema, default: () => ({}) },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    source: { type: String, default: "mock" },
    error: String,
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true, collection: "searches" }
)

searchSchema.index({ createdAt: -1 })

export type SearchDocument = InferSchemaType<typeof searchSchema>

export const SearchModel: Model<SearchDocument> =
  (models.Search as Model<SearchDocument>) ??
  model<SearchDocument>("Search", searchSchema)
