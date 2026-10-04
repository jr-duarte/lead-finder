import { NextResponse } from "next/server"

import { followUpService } from "@/services/follow-up/follow-up.service"

import { followUpError } from "@/app/api/follow-ups/respond"

export const dynamic = "force-dynamic"
// Runs through the local Claude Code CLI and can take a while.
export const maxDuration = 300

type Context = { params: Promise<{ id: string }> }

/** Writes a new follow-up message with Claude. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    return NextResponse.json(await followUpService.regenerate(id))
  } catch (error) {
    return followUpError(error)
  }
}
