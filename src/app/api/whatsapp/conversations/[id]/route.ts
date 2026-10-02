import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { whatsappConversationService } from "@/services/whatsapp/conversation.service"
import { whatsappSessionService } from "@/services/whatsapp/session.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** The conversation with its contact and linked lead. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const detail = await whatsappConversationService.detail(id)
    if (!detail) {
      return NextResponse.json(
        { message: "Conversa não encontrada." },
        { status: 404 }
      )
    }
    return NextResponse.json(detail)
  } catch (error) {
    return apiError(error)
  }
}

/**
 * Deletes the conversation from the CRM, with its messages and files. The
 * contact, the lead and the chat on the phone are left as they are.
 */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const deleted = await whatsappSessionService.deleteConversation(id)
    if (!deleted) {
      return NextResponse.json(
        { message: "Conversa não encontrada." },
        { status: 404 }
      )
    }
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return apiError(error)
  }
}
