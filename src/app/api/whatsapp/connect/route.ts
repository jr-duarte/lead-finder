import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { whatsappSessionService } from "@/services/whatsapp/session.service"

export const dynamic = "force-dynamic"

/** Starts the connection; a no-op if one is already up or starting. */
export async function POST() {
  try {
    return NextResponse.json(await whatsappSessionService.connect())
  } catch (error) {
    return apiError(error)
  }
}
