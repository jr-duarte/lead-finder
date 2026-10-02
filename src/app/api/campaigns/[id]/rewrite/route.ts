import { NextResponse } from "next/server"

import { campaignService } from "@/services/campaign/campaign.service"

import { campaignError } from "@/app/api/campaigns/respond"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Writes again every message not sent yet, from the current angle. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    return NextResponse.json({
      rewritten: await campaignService.rewriteUnsent(id),
    })
  } catch (error) {
    return campaignError(error)
  }
}
