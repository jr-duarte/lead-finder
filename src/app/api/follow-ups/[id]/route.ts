import { NextResponse } from "next/server"

import { followUpUpdateSchema } from "@/schemas/follow-up"
import { followUpService } from "@/services/follow-up/follow-up.service"

import { followUpError } from "@/app/api/follow-ups/respond"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Edits a follow-up's message, approves it or skips it. */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const patch = followUpUpdateSchema.parse(await request.json())
    return NextResponse.json(await followUpService.update(id, patch))
  } catch (error) {
    return followUpError(error)
  }
}
