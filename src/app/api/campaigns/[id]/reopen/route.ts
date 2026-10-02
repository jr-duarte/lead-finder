import { NextResponse } from "next/server"

import { campaignService } from "@/services/campaign/campaign.service"

import { campaignError } from "@/app/api/campaigns/respond"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/**
 * Brings a finished or cancelled campaign back, paused. Leads the cancel
 * released return for review when they are still free.
 */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    return NextResponse.json(await campaignService.reopen(id))
  } catch (error) {
    return campaignError(error)
  }
}
