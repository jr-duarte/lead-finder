import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { ClaudeCliError } from "@/lib/claude-cli"
import {
  ApproachInputError,
  approachService,
} from "@/services/approach.service"

export const dynamic = "force-dynamic"
// Generation runs through the local Claude Code CLI and can take a while.
export const maxDuration = 300

type Context = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const business = await approachService.generate(id)
    return NextResponse.json(business)
  } catch (error) {
    if (error instanceof ApproachInputError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      )
    }
    if (error instanceof ClaudeCliError) {
      return NextResponse.json({ message: error.message }, { status: 502 })
    }
    return apiError(error)
  }
}
