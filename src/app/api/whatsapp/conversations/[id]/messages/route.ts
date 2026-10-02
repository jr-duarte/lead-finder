import { NextResponse } from "next/server"

import { apiError, searchParamsToObject } from "@/lib/api"
import { messageListSchema, sendMessageSchema } from "@/schemas/whatsapp"
import { whatsappConversationService } from "@/services/whatsapp/conversation.service"
import {
  WhatsAppActionError,
  whatsappSessionService,
} from "@/services/whatsapp/session.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** History, newest first, one page at a time (`?before=<messageId>`). */
export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const query = messageListSchema.parse(searchParamsToObject(request.url))
    return NextResponse.json(
      await whatsappConversationService.messages(id, query)
    )
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const { text } = sendMessageSchema.parse(await request.json())
    const message = await whatsappSessionService.sendText(id, text)
    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    if (error instanceof WhatsAppActionError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      )
    }
    return apiError(error)
  }
}
