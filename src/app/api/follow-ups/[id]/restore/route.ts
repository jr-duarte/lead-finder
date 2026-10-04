import { NextResponse } from "next/server"

import { followUpService } from "@/services/follow-up/follow-up.service"

import { followUpError } from "@/app/api/follow-ups/respond"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Undoes a skip: the follow-up comes back for review. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    return NextResponse.json(await followUpService.restore(id))
  } catch (error) {
    return followUpError(error)
  }
}
