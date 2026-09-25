import { normalizeInstagram } from "@crawler/parsers/place.parser"

export type WebsiteExtraction = {
  title?: string
  emails: string[]
  instagram?: string
  facebook?: string
  whatsapp?: string
  linkedin?: string
  technologies: string[]
}

const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

// Assets and tracking pixels frequently look like emails; skip those.
const EMAIL_BLOCKLIST =
  /(\.png|\.jpe?g|\.gif|\.svg|\.webp|sentry|example\.com)$/i

/** Signals mapped to the technology they imply. */
const TECHNOLOGY_SIGNALS: { pattern: RegExp; label: string }[] = [
  { pattern: /wp-content|wp-includes/i, label: "WordPress" },
  { pattern: /cdn\.shopify\.com|shopify/i, label: "Shopify" },
  { pattern: /wix\.com|wixstatic/i, label: "Wix" },
  { pattern: /squarespace/i, label: "Squarespace" },
  { pattern: /_next\/static/i, label: "Next.js" },
  { pattern: /googletagmanager\.com/i, label: "Google Tag Manager" },
  { pattern: /google-analytics\.com|gtag\(/i, label: "Google Analytics" },
  { pattern: /connect\.facebook\.net/i, label: "Meta Pixel" },
  { pattern: /vtex/i, label: "VTEX" },
  { pattern: /rdstation/i, label: "RD Station" },
]

/**
 * Paths that belong to the platform itself rather than to a company. Social
 * sites link to these in their own headers and footers, so the first match on
 * a page is often "help" or "privacy" instead of a real profile.
 */
const FACEBOOK_RESERVED = new Set([
  "help",
  "privacy",
  "policies",
  "policy",
  "terms",
  "legal",
  "about",
  "login",
  "signup",
  "settings",
  "sharer",
  "share",
  "dialog",
  "plugins",
  "tr",
  "profile.php",
  "pages",
  "groups",
  "events",
  "marketplace",
  "watch",
  "business",
  "careers",
  "home.php",
  "recover",
])

const LINKEDIN_RESERVED = new Set([
  "help",
  "legal",
  "login",
  "signup",
  "feed",
  "jobs",
  "learning",
  "privacy",
  "accessibility",
])

/**
 * Returns the first handle that is a plausible profile, skipping the
 * platform's own pages.
 */
function firstProfileHandle(
  html: string,
  pattern: RegExp,
  reserved: Set<string>
): string | undefined {
  for (const match of html.matchAll(pattern)) {
    const handle = match[1]
    if (!handle) continue
    if (reserved.has(handle.toLowerCase())) continue
    // A bare numeric id is usually a tracking or plugin URL.
    if (/^\d+$/.test(handle)) continue

    return handle
  }

  return undefined
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function firstMatch(html: string, regex: RegExp): string | undefined {
  const match = html.match(regex)
  return match?.[1]
}

/**
 * Extracts contact data from raw HTML with regexes rather than a DOM parser:
 * pages are fetched only to mine contacts, so full parsing is unnecessary
 * weight.
 */
export function extractFromHtml(html: string): WebsiteExtraction {
  const title = firstMatch(html, /<title[^>]*>([\s\S]{1,300}?)<\/title>/i)

  const emails = Array.from(
    new Set(
      (html.match(EMAIL_REGEX) ?? [])
        .map((email) => email.toLowerCase())
        .filter((email) => !EMAIL_BLOCKLIST.test(email))
    )
  ).slice(0, 5)

  // Scans every occurrence so a reserved path early in the page does not
  // shadow the real profile further down.
  let instagram: string | undefined
  for (const match of html.matchAll(
    /(?:https?:)?\/\/(?:[a-z-]+\.)?instagram\.com\/([A-Za-z0-9._]+)/gi
  )) {
    instagram = normalizeInstagram(match[1])
    if (instagram) break
  }

  const facebook = firstProfileHandle(
    html,
    /(?:https?:)?\/\/(?:[a-z-]+\.)?facebook\.com\/([A-Za-z0-9._-]+)/gi,
    FACEBOOK_RESERVED
  )

  const whatsappRaw = firstMatch(
    html,
    /(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\d{8,15})/i
  )

  // Stored as "company/slug" or "in/slug" so the link can be rebuilt exactly;
  // a personal profile is not reachable under /company/.
  let linkedin: string | undefined
  for (const match of html.matchAll(
    /(?:https?:)?\/\/(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/(company|in)\/([A-Za-z0-9._-]+)/gi
  )) {
    const [, kind, handle] = match
    if (!handle || LINKEDIN_RESERVED.has(handle.toLowerCase())) continue
    linkedin = `${kind.toLowerCase()}/${handle}`
    break
  }

  const technologies = TECHNOLOGY_SIGNALS.filter((signal) =>
    signal.pattern.test(html)
  ).map((signal) => signal.label)

  return {
    title: title ? decodeEntities(title).trim().slice(0, 200) : undefined,
    emails,
    instagram,
    facebook,
    whatsapp: whatsappRaw,
    linkedin,
    technologies,
  }
}

/**
 * Link texts and paths that usually lead to contact details, ordered by how
 * likely they are to carry an e-mail address.
 */
const CONTACT_HINTS: { pattern: RegExp; weight: number }[] = [
  { pattern: /\bcontatos?\b/i, weight: 10 },
  { pattern: /\bfale[-\s]?conosco\b/i, weight: 10 },
  { pattern: /\bcontact\b/i, weight: 9 },
  { pattern: /\batendimento\b/i, weight: 7 },
  { pattern: /\bsobre\b|\bquem[-\s]?somos\b/i, weight: 5 },
  { pattern: /\babout\b/i, weight: 4 },
  { pattern: /\bsuporte\b|\bsupport\b/i, weight: 4 },
  { pattern: /\btrabalhe[-\s]?conosco\b/i, weight: 3 },
]

/** Anything that is clearly not a contact page, even if the text matches. */
const LINK_BLOCKLIST =
  /\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|doc x?)$|^(mailto|tel|javascript):|\/wp-(admin|login)/i

type ScoredLink = { url: string; score: number }

/**
 * Finds in-site links that likely lead to contact information, best first.
 * Only same-origin links are returned: following external links would crawl
 * the wider web rather than the lead's own site.
 */
export function findContactLinks(
  html: string,
  baseUrl: string,
  limit = 2
): string[] {
  let origin: URL
  try {
    origin = new URL(baseUrl)
  } catch {
    return []
  }

  const anchors = html.matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi
  )

  const scored = new Map<string, ScoredLink>()

  for (const anchor of anchors) {
    const href = anchor[1]
    // Strip tags from the label so "<span>Contato</span>" still matches.
    const label = anchor[2].replace(/<[^>]+>/g, " ")

    if (LINK_BLOCKLIST.test(href)) continue

    let resolved: URL
    try {
      resolved = new URL(href, origin)
    } catch {
      continue
    }

    if (resolved.origin !== origin.origin) continue

    resolved.hash = ""
    const url = resolved.toString()
    if (url.replace(/\/$/, "") === baseUrl.replace(/\/$/, "")) continue

    // The href and the visible text both count as evidence.
    const haystack = `${decodeURIComponent(resolved.pathname)} ${label}`
    const score = CONTACT_HINTS.reduce(
      (total, hint) =>
        hint.pattern.test(haystack) ? total + hint.weight : total,
      0
    )

    if (score === 0) continue

    const existing = scored.get(url)
    if (!existing || existing.score < score) {
      scored.set(url, { url, score })
    }
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((link) => link.url)
}

/**
 * Combines extractions from several pages of the same site. The first page
 * (the home) wins for title and technologies; contact fields are filled by
 * whichever page found them first.
 */
export function mergeExtractions(
  extractions: WebsiteExtraction[]
): WebsiteExtraction {
  const [first, ...rest] = extractions
  if (!first) {
    return { emails: [], technologies: [] }
  }

  const merged: WebsiteExtraction = {
    title: first.title,
    emails: [...first.emails],
    instagram: first.instagram,
    facebook: first.facebook,
    whatsapp: first.whatsapp,
    linkedin: first.linkedin,
    technologies: [...first.technologies],
  }

  for (const extraction of rest) {
    merged.emails = Array.from(
      new Set([...merged.emails, ...extraction.emails])
    ).slice(0, 5)

    merged.instagram ??= extraction.instagram
    merged.facebook ??= extraction.facebook
    merged.whatsapp ??= extraction.whatsapp
    merged.linkedin ??= extraction.linkedin

    merged.technologies = Array.from(
      new Set([...merged.technologies, ...extraction.technologies])
    )
  }

  return merged
}
