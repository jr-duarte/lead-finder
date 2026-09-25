import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { enrichmentJobService } from "@/services/enrichment.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params

    // Body is optional here: the table action may send the render flag.
    // Rendering defaults to on, matching the batch behaviour.
    const payload = await request.json().catch(() => ({}))
    const renderJavaScript = payload?.renderJavaScript !== false

    const job = await enrichmentJobService.start([id], { renderJavaScript })
    return NextResponse.json(job, { status: 202 })
  } catch (error) {
    return apiError(error)
  }
}
