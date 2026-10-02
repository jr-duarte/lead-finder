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
 * Opens a conversation, with a lead (`businessId`, trying each of its
 * numbers) or with a number typed by hand (`phone`, optional `name`).
 * Returns the existing conversation when there is one.
 */
export async function POST(request: Request) {
  try {
    const input = startConversationSchema.parse(await request.json())
    const conversation =
      "businessId" in input
        ? await whatsappSessionService.startConversation(input.businessId)
        : await whatsappSessionService.startConversationWithNumber(
            input.phone,
            input.name
          )
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
