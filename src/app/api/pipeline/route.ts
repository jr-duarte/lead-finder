import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import {
  addToPipelineSchema,
  removeFromPipelineSchema,
} from "@/schemas/pipeline"
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

export async function DELETE(request: Request) {
  try {
    const { ids } = removeFromPipelineSchema.parse(await request.json())
    const removed = await pipelineService.remove(ids)

    return NextResponse.json({ removed })
  } catch (error) {
    return apiError(error)
  }
}
