import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { conversationAvatar } from "@/services/whatsapp/avatar.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/**
 * The contact's profile picture, served from here rather than linking to
 * WhatsApp: its links expire, and this keeps the browser cache valid.
 * 404 when the contact shows no picture; the interface falls back to
 * initials. Both answers are cached for a while, so scrolling the inbox
 * does not query WhatsApp again.
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const avatar = await conversationAvatar(id)
    if (!avatar) {
      return new NextResponse(null, {
        status: 404,
        headers: { "Cache-Control": "private, max-age=3600" },
      })
    }
    return new NextResponse(new Uint8Array(avatar.data), {
      headers: {
        "Content-Type": avatar.contentType,
        "Cache-Control": "private, max-age=21600",
      },
    })
  } catch (error) {
    return apiError(error)
  }
}
