import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

import { BUSINESS_STATUS } from "@/domain/business"
import { PIPELINE_STAGES } from "@/domain/pipeline"

const addressSchema = new Schema(
  {
    street: String,
    number: String,
    neighborhood: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
    formatted: String,
  },
  { _id: false }
)

const locationSchema = new Schema(
  {
    latitude: Number,
    longitude: Number,
  },
  { _id: false }
)

const socialSchema = new Schema(
  {
    instagram: String,
    facebook: String,
    whatsapp: String,
    linkedin: String,
  },
  { _id: false }
)

const enrichmentSchema = new Schema(
  {
    enrichedAt: Date,
    emails: { type: [String], default: [] },
    socials: { type: socialSchema, default: () => ({}) },
    websiteStatus: Number,
    websiteTitle: String,
    technologies: { type: [String], default: [] },
    error: String,
  },
  { _id: false }
)

const registryActivitySchema = new Schema(
  {
    code: String,
    description: String,
  },
  { _id: false }
)

const registryPartnerSchema = new Schema(
  {
    name: String,
    role: String,
    since: String,
  },
  { _id: false }
)

/** Receita Federal record looked up by CNPJ. */
const registrySchema = new Schema(
  {
    cnpj: String,
    fetchedAt: Date,
    legalName: String,
    tradeName: String,
    status: String,
    statusDate: String,
    openedAt: String,
    size: String,
    legalNature: String,
    mainActivity: { type: registryActivitySchema, default: undefined },
    secondaryActivities: { type: [registryActivitySchema], default: [] },
    shareCapital: Number,
    simples: Boolean,
    mei: Boolean,
    email: String,
    phones: { type: [String], default: [] },
    partners: { type: [registryPartnerSchema], default: [] },
    error: String,
  },
  { _id: false }
)

const pipelineSchema = new Schema(
  {
    stage: { type: String, enum: PIPELINE_STAGES, required: true },
    position: { type: Number, default: 0 },
    enteredAt: { type: Date, default: () => new Date() },
    movedAt: Date,
    note: String,
  },
  { _id: false }
)

const businessSchema = new Schema(
  {
    externalId: { type: String, required: true },
    source: { type: String, required: true, default: "mock" },
    name: { type: String, required: true, trim: true },
    cnpj: { type: String, trim: true, index: true },
    category: { type: String, trim: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },
    rating: { type: Number, min: 0, max: 5 },
    reviewsCount: { type: Number, min: 0, default: 0 },
    operationalStatus: { type: String, index: true },
    primaryType: { type: String, index: true },
    mapsUrl: { type: String },
    address: { type: addressSchema, default: () => ({}) },
    location: { type: locationSchema, default: () => ({}) },
    enrichment: { type: enrichmentSchema, default: () => ({}) },
    registry: { type: registrySchema, default: undefined },
    status: {
      type: String,
      enum: BUSINESS_STATUS,
      default: "NEW",
      index: true,
    },
    searchIds: { type: [Schema.Types.ObjectId], default: [], ref: "Search" },
    collectedAt: { type: Date, default: () => new Date(), index: true },
    pipeline: { type: pipelineSchema, default: undefined },
  },
  { timestamps: true, collection: "businesses" }
)

// Identity of a place is (source, externalId): re-running a search updates
// instead of duplicating.
businessSchema.index({ source: 1, externalId: 1 }, { unique: true })
businessSchema.index({ name: "text", category: "text" })
businessSchema.index({ "address.city": 1, "address.state": 1 })
businessSchema.index({ rating: -1 })
businessSchema.index({ website: 1 })
// Board queries read one column at a time, ordered by manual position.
businessSchema.index({ "pipeline.stage": 1, "pipeline.position": 1 })

export type BusinessDocument = InferSchemaType<typeof businessSchema>

export const BusinessModel: Model<BusinessDocument> =
  (models.Business as Model<BusinessDocument>) ??
  model<BusinessDocument>("Business", businessSchema)
