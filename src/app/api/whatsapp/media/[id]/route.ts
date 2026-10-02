import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import {
  MEDIA_URL_TTL_SECONDS,
  mediaSignedUrl,
} from "@/services/whatsapp/media.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/**
 * A message's file. The bucket stays private: this redirects to a signed
 * link, and the browser may reuse the redirect while that link is valid.
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const url = await mediaSignedUrl(id)
    if (!url) {
      return NextResponse.json(
        { message: "Mídia não encontrada." },
        { status: 404 }
      )
    }
    const response = NextResponse.redirect(url, 302)
    response.headers.set(
      "Cache-Control",
      `private, max-age=${Math.floor(MEDIA_URL_TTL_SECONDS / 2)}`
    )
    return response
  } catch (error) {
    return apiError(error)
  }
}
