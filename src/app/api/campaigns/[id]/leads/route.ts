import { NextResponse } from "next/server"

import { campaignLeadsSchema } from "@/schemas/campaign"
import { campaignService } from "@/services/campaign/campaign.service"

import { campaignError } from "@/app/api/campaigns/respond"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Adds leads; the response lists the ones left out and why. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const { businessIds } = campaignLeadsSchema.parse(await request.json())
    return NextResponse.json(await campaignService.addLeads(id, businessIds))
  } catch (error) {
    return campaignError(error)
  }
}
