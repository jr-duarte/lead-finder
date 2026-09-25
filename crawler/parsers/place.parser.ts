import type { RawPlace } from "@crawler/sources/types"

/** Normalizes a phone number to digits plus an optional leading "+". */
export function normalizePhone(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const hasPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length < 8) return undefined

  return hasPlus ? `+${digits}` : digits
}

/** Normalizes a website URL, adding a scheme when missing. */
export function normalizeWebsite(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const url = new URL(withScheme)
    if (!url.hostname.includes(".")) return undefined
    return url.toString().replace(/\/$/, "")
  } catch {
    return undefined
  }
}

/**
 * Instagram paths that are part of the platform rather than a profile.
 */
const INSTAGRAM_RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "explore",
  "accounts",
  "about",
  "legal",
  "privacy",
  "terms",
  "help",
  "developer",
  "directory",
  "stories",
  "tv",
  "challenge",
  "emails",
])

/** Extracts an Instagram handle from a URL or an @handle string. */
export function normalizeInstagram(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const fromUrl = trimmed.match(/instagram\.com\/([A-Za-z0-9._]+)(?:\/|\?|$)/i)
  const handle = fromUrl ? fromUrl[1] : trimmed.replace(/^@/, "")

  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return undefined
  if (INSTAGRAM_RESERVED.has(handle.toLowerCase())) return undefined

  return handle.toLowerCase()
}

export function buildFormattedAddress(
  address: RawPlace["address"]
): string | undefined {
  const line = [
    [address.street, address.number].filter(Boolean).join(", "),
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join(" - "),
  ]
    .filter((part) => part && part.length > 0)
    .join(" • ")

  return line.length > 0 ? line : undefined
}

/** Applies all normalizations, guaranteeing a consistent shape. */
export function normalizePlace(place: RawPlace): RawPlace {
  const address = { ...place.address }

  return {
    ...place,
    name: place.name.trim(),
    category: place.category?.trim() || undefined,
    phone: normalizePhone(place.phone),
    website: normalizeWebsite(place.website),
    rating:
      typeof place.rating === "number"
        ? Math.min(5, Math.max(0, Number(place.rating.toFixed(1))))
        : undefined,
    reviewsCount:
      typeof place.reviewsCount === "number"
        ? Math.max(0, Math.round(place.reviewsCount))
        : 0,
    address: {
      ...address,
      formatted: address.formatted ?? buildFormattedAddress(address),
    },
  }
}
