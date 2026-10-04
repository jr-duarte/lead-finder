import { NextResponse } from "next/server"

import { followUpLostSchema } from "@/schemas/follow-up"
import { followUpService } from "@/services/follow-up/follow-up.service"

import { followUpError } from "@/app/api/follow-ups/respond"

export const dynamic = "force-dynamic"

/** "Mover para Perdido" for leads that did not answer the follow-up. */
export async function POST(request: Request) {
  try {
    const { ids } = followUpLostSchema.parse(await request.json())
    return NextResponse.json({ moved: await followUpService.markLost(ids) })
  } catch (error) {
    return followUpError(error)
  }
}
