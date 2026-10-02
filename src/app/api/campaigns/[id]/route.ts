import { NextResponse } from "next/server"

import { campaignUpdateSchema } from "@/schemas/campaign"
import { campaignService } from "@/services/campaign/campaign.service"

import { campaignError } from "@/app/api/campaigns/respond"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** The campaign, its leads and the daily limit in force. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    return NextResponse.json(await campaignService.detail(id))
  } catch (error) {
    return campaignError(error)
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const patch = campaignUpdateSchema.parse(await request.json())
    return NextResponse.json(await campaignService.updateSettings(id, patch))
  } catch (error) {
    return campaignError(error)
  }
}
