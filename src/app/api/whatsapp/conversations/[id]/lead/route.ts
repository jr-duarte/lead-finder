import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { linkLeadSchema } from "@/schemas/whatsapp"
import { whatsappConversationService } from "@/services/whatsapp/conversation.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Links the conversation to a lead, or unlinks it with `businessId: null`. */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const { businessId } = linkLeadSchema.parse(await request.json())
    const result = await whatsappConversationService.linkLead(id, businessId)

    if (result === "lead-not-found") {
      return NextResponse.json(
        { message: "Lead não encontrado." },
        { status: 404 }
      )
    }
    if (!result) {
      return NextResponse.json(
        { message: "Conversa não encontrada." },
        { status: 404 }
      )
    }
    return NextResponse.json(result)
  } catch (error) {
    return apiError(error)
  }
}
