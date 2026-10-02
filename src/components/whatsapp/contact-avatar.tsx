"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

/** Up to two initials from a name; digits-only titles (phones) get none. */
function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return ""
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ""
  return (first + last).toUpperCase()
}

/** The contact's WhatsApp picture, or their initials while it loads or when hidden. */
export function ContactAvatar({
  conversationId,
  name,
  size = "lg",
  className,
}: {
  conversationId: string
  name: string
  size?: "default" | "sm" | "lg"
  className?: string
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarImage
        src={`/api/whatsapp/conversations/${conversationId}/avatar`}
        alt=""
      />
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
