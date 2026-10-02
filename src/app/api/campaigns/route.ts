import { NextResponse } from "next/server"

import { campaignCreateSchema } from "@/schemas/campaign"
import { campaignService } from "@/services/campaign/campaign.service"

import { campaignError } from "@/app/api/campaigns/respond"

export const dynamic = "force-dynamic"

/** All campaigns, or only open ones with `?open=1` (to add leads to). */
export async function GET(request: Request) {
  try {
    const open = new URL(request.url).searchParams.get("open") === "1"
    const campaigns = open
      ? await campaignService.open()
      : await campaignService.list()
    return NextResponse.json({ campaigns })
  } catch (error) {
    return campaignError(error)
  }
}

/**
 * Creates a campaign with the eligible leads and starts writing their
 * messages in the background. The response lists the leads left out.
 */
export async function POST(request: Request) {
  try {
    const input = campaignCreateSchema.parse(await request.json())
    const result = await campaignService.create(input)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return campaignError(error)
  }
}
