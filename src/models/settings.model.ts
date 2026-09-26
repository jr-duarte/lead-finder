import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose"

/**
 * App-wide settings, stored as a single document keyed "default": the app
 * is single-user, so there is nothing to scope them by.
 */
const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    seller: {
      sellerName: { type: String, trim: true },
      offer: { type: String, trim: true, maxlength: 4000 },
      instructions: { type: String, trim: true, maxlength: 2000 },
    },
  },
  { timestamps: true, collection: "settings" }
)

export type SettingsDocument = InferSchemaType<typeof settingsSchema>

export const SettingsModel: Model<SettingsDocument> =
  (models.Settings as Model<SettingsDocument>) ??
  model<SettingsDocument>("Settings", settingsSchema)
