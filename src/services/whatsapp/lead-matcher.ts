import { Types } from "mongoose"

import { phoneMatchKey } from "@/domain/whatsapp"
import { connectToDatabase } from "@/lib/mongoose"
import { BusinessModel } from "@/models/business.model"

type PhoneFields = {
  _id: Types.ObjectId
  phone?: string
  enrichment?: { socials?: { whatsapp?: string } }
  registry?: { phones?: string[] }
}

/**
 * Regex matching the last 8 digits however they are punctuated, e.g.
 * "(11) 99999-8888" or "+55 11 99999 8888".
 */
function suffixPattern(key: string): RegExp {
  return new RegExp(`${key.slice(-8).split("").join("\\D*")}\\D*$`)
}

/**
 * Finds the lead a phone number belongs to. Returns an id only when exactly
 * one business matches: a guess between two leads would be worse than none.
 */
export async function findLeadByPhone(
  phone?: string
): Promise<string | undefined> {
  // WhatsApp numbers always carry the country code.
  const key = phoneMatchKey(phone, { international: true })
  if (!key) return undefined

  await connectToDatabase()
  const pattern = suffixPattern(key)

  // The suffix narrows candidates cheaply; the full key confirms them.
  const candidates = await BusinessModel.find({
    $or: [
      { phone: pattern },
      { "enrichment.socials.whatsapp": pattern },
      { "registry.phones": pattern },
    ],
  })
    .select("phone enrichment.socials.whatsapp registry.phones")
    .limit(20)
    .lean<PhoneFields[]>()
    .exec()

  const matches = candidates.filter((business) =>
    [
      business.phone,
      business.enrichment?.socials?.whatsapp,
      ...(business.registry?.phones ?? []),
    ].some((value) => phoneMatchKey(value) === key)
  )

  return matches.length === 1 ? String(matches[0]._id) : undefined
}
