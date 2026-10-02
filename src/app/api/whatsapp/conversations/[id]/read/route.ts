import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { whatsappConversationService } from "@/services/whatsapp/conversation.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Zeroes the unread counter in the CRM; no read receipt is sent. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const conversation = await whatsappConversationService.markRead(id)
    if (!conversation) {
      return NextResponse.json(
        { message: "Conversa não encontrada." },
        { status: 404 }
      )
    }
    return NextResponse.json(conversation)
  } catch (error) {
    return apiError(error)
  }
}
