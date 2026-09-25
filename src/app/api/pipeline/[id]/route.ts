import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { moveCardSchema, pipelineNoteSchema } from "@/schemas/pipeline"
import { pipelineService } from "@/services/pipeline.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Moves a card between columns, or reorders it within one. */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const payload = await request.json()

    // A note-only update keeps the card where it is.
    if (typeof payload?.note === "string" && !payload?.stage) {
      const { note } = pipelineNoteSchema.parse(payload)
      const business = await pipelineService.setNote(id, note)

      if (!business) {
        return NextResponse.json(
          { message: "Empresa não encontrada." },
          { status: 404 }
        )
      }

      return NextResponse.json(business)
    }

    const { stage, position } = moveCardSchema.parse(payload)
    const business = await pipelineService.move(id, stage, position)

    if (!business) {
      return NextResponse.json(
        { message: "Empresa não encontrada." },
        { status: 404 }
      )
    }

    return NextResponse.json(business)
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const removed = await pipelineService.remove([id])
    return NextResponse.json({ removed })
  } catch (error) {
    return apiError(error)
  }
}
