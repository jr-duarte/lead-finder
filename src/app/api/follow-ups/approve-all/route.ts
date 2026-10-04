import { NextResponse } from "next/server"

import { followUpService } from "@/services/follow-up/follow-up.service"

import { followUpError } from "@/app/api/follow-ups/respond"

export const dynamic = "force-dynamic"

/** Moves every follow-up waiting for approval to the send queue. */
export async function POST() {
  try {
    return NextResponse.json({ approved: await followUpService.approveAll() })
  } catch (error) {
    return followUpError(error)
  }
}
