import { NextResponse } from "next/server"

import { campaignError } from "@/app/api/campaigns/respond"
import { campaignService } from "@/services/campaign/campaign.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string; itemId: string }> }

/** Undoes a skip: the lead goes back to review if it is still eligible. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { id, itemId } = await params
    return NextResponse.json(await campaignService.restoreItem(id, itemId))
  } catch (error) {
    return campaignError(error)
  }
}
