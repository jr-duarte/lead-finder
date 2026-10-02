import { NextResponse } from "next/server"

import { apiError, searchParamsToObject } from "@/lib/api"
import { conversationListSchema } from "@/schemas/whatsapp"
import { whatsappConversationService } from "@/services/whatsapp/conversation.service"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const params = conversationListSchema.parse(
      searchParamsToObject(request.url)
    )
    return NextResponse.json(await whatsappConversationService.list(params))
  } catch (error) {
    return apiError(error)
  }
}
