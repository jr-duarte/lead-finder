import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { whatsappSessionService } from "@/services/whatsapp/session.service"

export const dynamic = "force-dynamic"

/** Unlinks this device from the phone and deletes the local session. */
export async function POST() {
  try {
    return NextResponse.json(await whatsappSessionService.disconnect())
  } catch (error) {
    return apiError(error)
  }
}
