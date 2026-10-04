import { NextResponse } from "next/server"

import { followUpService } from "@/services/follow-up/follow-up.service"

import { followUpError } from "@/app/api/follow-ups/respond"

export const dynamic = "force-dynamic"

/** Classifies the replies of leads in "Respondeu" again, in the background. */
export async function POST() {
  try {
    followUpService.reviewAutoReplies()
    return NextResponse.json({ ok: true })
  } catch (error) {
    return followUpError(error)
  }
}
