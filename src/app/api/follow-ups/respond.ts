import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { ClaudeCliError } from "@/lib/claude-cli"
import { ApproachInputError } from "@/services/approach.service"
import { FollowUpError } from "@/services/follow-up/follow-up.service"

/** Maps follow-up failures to the status the user should see. */
export function followUpError(error: unknown) {
  if (error instanceof FollowUpError || error instanceof ApproachInputError) {
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
