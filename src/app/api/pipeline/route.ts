import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import {
  addToPipelineSchema,
  removeFromPipelineSchema,
  setStageSchema,
} from "@/schemas/pipeline"
import { followUpService } from "@/services/follow-up/follow-up.service"
import { pipelineService } from "@/services/pipeline.service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const columns = await pipelineService.board()
    return NextResponse.json({ columns })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { ids, stage } = addToPipelineSchema.parse(await request.json())
    const added = await pipelineService.add(ids, stage)

    return NextResponse.json({ added, skipped: ids.length - added })
  } catch (error) {
    return apiError(error)
  }
}

/** Moves several leads to one stage, adding those not yet on the board. */
export async function PATCH(request: Request) {
  try {
    const { ids, stage } = setStageSchema.parse(await request.json())
    const { moved, added } = await pipelineService.setStage(ids, stage)
    // Leads moved out of "Contatado" no longer get their follow-up.
    if (moved > 0) await followUpService.onLeadsMoved(ids)

    return NextResponse.json({
      moved,
      added,
      unchanged: ids.length - moved - added,
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const { ids } = removeFromPipelineSchema.parse(await request.json())
    const removed = await pipelineService.remove(ids)

    return NextResponse.json({ removed })
  } catch (error) {
    return apiError(error)
  }
}
