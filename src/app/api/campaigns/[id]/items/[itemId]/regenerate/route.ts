import { NextResponse } from "next/server"

import { campaignService } from "@/services/campaign/campaign.service"

import { campaignError } from "@/app/api/campaigns/respond"

export const dynamic = "force-dynamic"
// Runs through the local Claude Code CLI and can take a while.
export const maxDuration = 300

type Context = { params: Promise<{ id: string; itemId: string }> }

/** Writes a new message for one lead with Claude. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { id, itemId } = await params
    return NextResponse.json(await campaignService.regenerate(id, itemId))
  } catch (error) {
    return campaignError(error)
  }
}
