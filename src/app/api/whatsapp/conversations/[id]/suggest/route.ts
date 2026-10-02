import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { ClaudeCliError } from "@/lib/claude-cli"
import { suggestReplySchema } from "@/schemas/whatsapp"
import {
  ReplySuggestionError,
  replySuggestionService,
} from "@/services/whatsapp/reply-suggestion.service"

export const dynamic = "force-dynamic"
// Runs through the local Claude Code CLI and can take a while.
export const maxDuration = 300

type Context = { params: Promise<{ id: string }> }

/** Suggests the next message. Nothing is sent: the client fills the composer. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const { draft } = suggestReplySchema.parse(
      await request.json().catch(() => ({}))
    )
    return NextResponse.json(
      await replySuggestionService.suggest(id, { draft })
    )
  } catch (error) {
    if (error instanceof ReplySuggestionError) {
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
