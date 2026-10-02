import parsePhoneNumber from "libphonenumber-js/max"

/**
 * Phone numbers of any country. The `max` metadata is what tells a mobile
 * from a landline; the default metadata cannot for most countries.
 */

export const PHONE_TYPES = [
  "MOBILE",
  "FIXED_LINE",
  /** Countries like the US and Canada, where the number does not tell. */
  "FIXED_LINE_OR_MOBILE",
  /** Toll free, VoIP, premium and other kinds. */
  "OTHER",
] as const

export type PhoneType = (typeof PHONE_TYPES)[number]

/** Types that may have WhatsApp: certainly mobile, or maybe mobile. */
export const WHATSAPP_PHONE_TYPES: PhoneType[] = [
  "MOBILE",
  "FIXED_LINE_OR_MOBILE",
]

/** Stored on the lead, so filters can query it. */
export type PhoneInfo = {
  /** Undefined when the number is not valid for any country. */
  type?: PhoneType
  /** ISO 3166-1 alpha-2, from the number's own country code when it has one. */
  country?: string
  /** Digits with country code, no "+". */
  digits?: string
}

/**
 * Countries where libphonenumber cannot tell mobiles from landlines, but the
 * national numbering plan can: a national number matching the pattern is a
 * mobile, anything else a landline. Chile: mobiles are 9 + 8 digits, while
 * landlines start with an area code (2 for Santiago).
 */
const MOBILE_PREFIXES: Record<string, RegExp> = {
  CL: /^9\d{8}$/,
}

function refineType(
  type: PhoneType,
  country: string | undefined,
  nationalNumber: string
): PhoneType {
  const mobile = country ? MOBILE_PREFIXES[country] : undefined
  if (type !== "FIXED_LINE_OR_MOBILE" || !mobile) return type
  return mobile.test(nationalNumber) ? "MOBILE" : "FIXED_LINE"
}

/** Numbers written without a country code are read in this country. */
export const DEFAULT_COUNTRY = "BR"

function normalizeCountry(country?: string | null): string {
  const value = country?.trim().toUpperCase()
  return value && /^[A-Z]{2}$/.test(value) ? value : DEFAULT_COUNTRY
}

/**
 * Reads a phone however it was written. A number with "+" (or a WhatsApp
 * link, which always carries the country code) keeps its own country;
 * anything else is read in `country`, the lead's country.
 */
export function analyzePhone(
  raw?: string | null,
  country?: string | null
): PhoneInfo | undefined {
  const text = raw?.trim()
  if (!text) return undefined

  const isLink = /wa\.me|whatsapp\.com/i.test(text)
  const digits = text.replace(/\D/g, "")
  if (digits.length < 7) return undefined
  const input = isLink || text.startsWith("+") ? `+${digits}` : text

  const parsed = parsePhoneNumber(input, normalizeCountry(country) as never)
  if (!parsed) return undefined
  const valid = parsed.isValid()
  const type = parsed.getType()
  return {
    type: !valid
      ? undefined
      : type === "MOBILE" ||
          type === "FIXED_LINE" ||
          type === "FIXED_LINE_OR_MOBILE"
        ? refineType(type, parsed.country, String(parsed.nationalNumber))
        : "OTHER",
    country: parsed.country,
    digits: parsed.number.replace(/^\+/, ""),
  }
}

/**
 * What a lead stores about its phone, derived from `phone` and the address
 * country. Undefined values clear the fields when the phone is removed.
 */
export function phoneFields(
  phone?: string | null,
  country?: string | null
): { phoneType: PhoneType | undefined; phoneCountry: string | undefined } {
  const info = analyzePhone(phone, country)
  return { phoneType: info?.type, phoneCountry: info?.country }
}

/**
 * The lead's country: the address one, else the one in its phone's country
 * code. The address wins because a code can be shared: +44 reads as
 * Guernsey as often as the UK.
 */
export function leadCountry(lead: {
  phoneCountry?: string
  address?: { country?: string }
}): string {
  return normalizeCountry(lead.address?.country ?? lead.phoneCountry)
}

/** Country name in Portuguese ("PT" → "Portugal"), or the code itself. */
export function countryName(code?: string | null): string | undefined {
  if (!code) return undefined
  try {
    return (
      new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(
        code.toUpperCase()
      ) ?? code
    )
  } catch {
    return code
  }
}
