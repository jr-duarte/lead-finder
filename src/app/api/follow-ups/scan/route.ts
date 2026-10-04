import { NextResponse } from "next/server"

import { followUpService } from "@/services/follow-up/follow-up.service"

import { followUpError } from "@/app/api/follow-ups/respond"

export const dynamic = "force-dynamic"

/** Looks for leads due for a follow-up right away. */
export async function POST() {
  try {
    return NextResponse.json({ created: await followUpService.scanNow() })
  } catch (error) {
    return followUpError(error)
  }
}
