import type { WhatsAppContact } from "@/domain/whatsapp"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"
import { whatsappSessionService } from "@/services/whatsapp/session.service"

/**
 * Contacts' profile pictures, fetched on demand when the inbox shows them.
 * WhatsApp hands out signed links that expire (the `oe` parameter, a hex
 * Unix time); the link is kept until then, and "no picture" for a day, so
 * WhatsApp is asked again only when something may have changed. A picture
 * change notification clears the cache right away.
 */

/** How long "no picture" (or a link without expiry) is trusted. */
const RECHECK_MS = 24 * 60 * 60 * 1000
/** Links are dropped a little before they actually expire. */
const EXPIRY_MARGIN_MS = 60 * 60 * 1000

export type Avatar = { data: Buffer; contentType: string }

/** Until when the cached answer for this contact holds. */
export function pictureValidUntil(
  contact: Pick<WhatsAppContact, "profilePicture" | "profilePictureCheckedAt">
): number {
  const checkedAt = contact.profilePictureCheckedAt?.getTime()
  if (!checkedAt) return 0
  const fallback = checkedAt + RECHECK_MS
  if (!contact.profilePicture) return fallback
  try {
    const oe = new URL(contact.profilePicture).searchParams.get("oe")
    const expires = oe ? parseInt(oe, 16) * 1000 : NaN
    return Number.isFinite(expires)
      ? Math.min(expires - EXPIRY_MARGIN_MS, checkedAt + 7 * RECHECK_MS)
      : fallback
  } catch {
    return 0
  }
}

async function download(url: string): Promise<Avatar | "expired" | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (response.status === 403 || response.status === 404) return "expired"
    if (!response.ok) return null
    return {
      data: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || "image/jpeg",
    }
  } catch {
    return null
  }
}

/** Asks WhatsApp for a fresh link and caches the answer. */
async function refresh(
  contact: WhatsAppContact
): Promise<string | null | "offline"> {
  let url: string | null | "offline"
  try {
    url = await whatsappSessionService.profilePictureUrl(contact.whatsappId)
  } catch (error) {
    // A picture is never worth an error page: no picture for now, and
    // nothing cached, so the next view tries again.
    console.warn(
      `[whatsapp] não foi possível buscar a foto de ${contact.whatsappId}`,
      error
    )
    return "offline"
  }
  if (url !== "offline") {
    await whatsappConversationRepository.setProfilePicture(contact.id, url)
  }
  return url
}

async function load(conversationId: string): Promise<Avatar | null> {
  const conversation =
    await whatsappConversationRepository.findById(conversationId)
  if (!conversation) return null
  const contact = await whatsappConversationRepository.findContactById(
    conversation.contactId
  )
  if (!contact) return null

  let url = contact.profilePicture ?? null
  let fresh = false
  if (Date.now() >= pictureValidUntil(contact)) {
    const answer = await refresh(contact)
    // Offline: the old link may still work, so it is tried anyway.
    if (answer !== "offline") {
      url = answer
      fresh = true
    }
  }
  if (!url) return null

  const result = await download(url)
  if (result !== "expired") return result
  if (fresh) return null
  // The link died before its time; one more try with a new one.
  const answer = await refresh(contact)
  if (!answer || answer === "offline") return null
  const retry = await download(answer)
  return retry === "expired" ? null : retry
}

/** Concurrent views of the same conversation share one lookup. */
const inFlight = new Map<string, Promise<Avatar | null>>()

/** The picture of a conversation's contact, or null when there is none. */
export function conversationAvatar(
  conversationId: string
): Promise<Avatar | null> {
  let pending = inFlight.get(conversationId)
  if (!pending) {
    pending = load(conversationId).finally(() =>
      inFlight.delete(conversationId)
    )
    inFlight.set(conversationId, pending)
  }
  return pending
}
