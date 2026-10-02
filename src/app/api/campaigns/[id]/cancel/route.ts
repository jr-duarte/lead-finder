import { NextResponse } from "next/server"

import { campaignService } from "@/services/campaign/campaign.service"

import { campaignError } from "@/app/api/campaigns/respond"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Ends the campaign and releases leads not yet contacted. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    return NextResponse.json(await campaignService.cancel(id))
  } catch (error) {
    return campaignError(error)
  }
}
