import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { whatsappSessionService } from "@/services/whatsapp/session.service"

export const dynamic = "force-dynamic"

/** Runs the incremental sync now. Safe to repeat: nothing is duplicated. */
export async function POST() {
  try {
    return NextResponse.json(await whatsappSessionService.sync())
  } catch (error) {
    return apiError(error)
  }
}
