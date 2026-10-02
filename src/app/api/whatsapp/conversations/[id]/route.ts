import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { whatsappConversationService } from "@/services/whatsapp/conversation.service"

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
