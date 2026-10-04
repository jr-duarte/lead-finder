import { NextResponse } from "next/server"

import { autoReplyResolveSchema } from "@/schemas/follow-up"
import { followUpService } from "@/services/follow-up/follow-up.service"

import { followUpError } from "@/app/api/follow-ups/respond"

export const dynamic = "force-dynamic"

/** Leads in "Respondeu" whose replies were all automatic. */
export async function GET() {
  try {
    return NextResponse.json({
      items: await followUpService.autoReplyReview(),
    })
  } catch (error) {
    return followUpError(error)
  }
}

/** Back to "Contatado", or "it was a person after all". */
export async function POST(request: Request) {
  try {
    const { businessId, action } = autoReplyResolveSchema.parse(
      await request.json()
    )
    await followUpService.resolveAutoReply(businessId, action)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return followUpError(error)
  }
}
