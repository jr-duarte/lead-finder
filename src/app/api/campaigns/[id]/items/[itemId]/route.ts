import { NextResponse } from "next/server"

import { campaignItemUpdateSchema } from "@/schemas/campaign"
import { campaignService } from "@/services/campaign/campaign.service"

import { campaignError } from "@/app/api/campaigns/respond"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string; itemId: string }> }

/** Edits a lead's message, approves it or skips it. */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, itemId } = await params
    const patch = campaignItemUpdateSchema.parse(await request.json())
    return NextResponse.json(
      await campaignService.updateItem(id, itemId, patch)
    )
  } catch (error) {
    return campaignError(error)
  }
}
