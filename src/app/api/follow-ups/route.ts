import { NextResponse } from "next/server"

import { followUpService } from "@/services/follow-up/follow-up.service"

import { followUpError } from "@/app/api/follow-ups/respond"

export const dynamic = "force-dynamic"

/** Every follow-up, newest first, with the counts per status. */
export async function GET() {
  try {
    return NextResponse.json(await followUpService.list())
  } catch (error) {
    return followUpError(error)
  }
}
