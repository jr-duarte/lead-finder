import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { whatsappSessionService } from "@/services/whatsapp/session.service"

export const dynamic = "force-dynamic"

/** Connection state, plus the QR code while one is waiting to be scanned. */
export async function GET() {
  try {
    return NextResponse.json(await whatsappSessionService.snapshot())
  } catch (error) {
    return apiError(error)
  }
}
