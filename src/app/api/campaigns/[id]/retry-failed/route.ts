import { NextResponse } from "next/server"

import { campaignService } from "@/services/campaign/campaign.service"

import { campaignError } from "@/app/api/campaigns/respond"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Puts failed leads back to be generated or approved again. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    return NextResponse.json({ retried: await campaignService.retryFailed(id) })
  } catch (error) {
    return campaignError(error)
  }
}
