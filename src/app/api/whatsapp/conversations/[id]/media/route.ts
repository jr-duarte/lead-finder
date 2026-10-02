import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import {
  MediaInputError,
  prepareOutgoingMedia,
} from "@/services/whatsapp/media.service"
import {
  WhatsAppActionError,
  whatsappSessionService,
} from "@/services/whatsapp/session.service"

export const dynamic = "force-dynamic"
// Audio conversion and the upload to WhatsApp can take a while.
export const maxDuration = 120

type Context = { params: Promise<{ id: string }> }

/**
 * Sends an image or an audio (multipart): `file`, plus an optional `caption`
 * for images and `voiceNote=true` for recordings made in the CRM.
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const form = await request.formData().catch(() => null)
    const file = form?.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Escolha um arquivo para enviar." },
        { status: 422 }
      )
    }
    const caption = form?.get("caption")

    const media = await prepareOutgoingMedia({
      data: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || "application/octet-stream",
      caption: typeof caption === "string" ? caption.slice(0, 4096) : undefined,
      voiceNote: form?.get("voiceNote") === "true",
    })
    const message = await whatsappSessionService.sendMedia(id, media)
    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    if (
      error instanceof WhatsAppActionError ||
      error instanceof MediaInputError
    ) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      )
    }
    return apiError(error)
  }
}
