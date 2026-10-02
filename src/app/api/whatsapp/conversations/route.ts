import { NextResponse } from "next/server"

import { apiError, searchParamsToObject } from "@/lib/api"
import {
  conversationListSchema,
  startConversationSchema,
} from "@/schemas/whatsapp"
import { whatsappConversationService } from "@/services/whatsapp/conversation.service"
import {
  WhatsAppActionError,
  whatsappSessionService,
} from "@/services/whatsapp/session.service"

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

/**
 * Opens the conversation with a lead, checking which of its numbers has
 * WhatsApp. Returns the existing one if the lead already has a conversation.
 */
export async function POST(request: Request) {
  try {
    const { businessId } = startConversationSchema.parse(await request.json())
    const conversation =
      await whatsappSessionService.startConversation(businessId)
    return NextResponse.json(conversation, { status: 201 })
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
