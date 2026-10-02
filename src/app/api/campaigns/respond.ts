import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { ClaudeCliError } from "@/lib/claude-cli"
import { ApproachInputError } from "@/services/approach.service"
import { CampaignError } from "@/services/campaign/campaign.service"

/** Maps campaign failures to the status the user should see. */
export function campaignError(error: unknown) {
  if (error instanceof CampaignError || error instanceof ApproachInputError) {
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
