import type { SellerProfile } from "@/domain/approach"
import { connectToDatabase } from "@/lib/mongoose"
import { SettingsModel } from "@/models/settings.model"

const KEY = "default"

type RawSettings = {
  seller?: {
    sellerName?: string | null
    offer?: string | null
    instructions?: string | null
  }
}

function toSeller(raw: RawSettings | null): SellerProfile {
  return {
    sellerName: raw?.seller?.sellerName ?? undefined,
    offer: raw?.seller?.offer ?? undefined,
    instructions: raw?.seller?.instructions ?? undefined,
  }
}

export const settingsRepository = {
  async getSeller(): Promise<SellerProfile> {
    await connectToDatabase()
    const raw = await SettingsModel.findOne({ key: KEY })
      .lean<RawSettings>()
      .exec()
    return toSeller(raw)
  },

  async updateSeller(seller: SellerProfile): Promise<SellerProfile> {
    await connectToDatabase()
    // Upsert: the document is created the first time settings are saved.
    const raw = await SettingsModel.findOneAndUpdate(
      { key: KEY },
      { $set: { seller } },
      { upsert: true, returnDocument: "after" }
    )
      .lean<RawSettings>()
      .exec()
    return toSeller(raw)
  },
}
