import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import {
  enrichmentBatchSchema,
  enrichmentRequestSchema,
} from "@/schemas/enrichment"
import { enrichmentJobService } from "@/services/enrichment.service"

export const dynamic = "force-dynamic"

/** Lists recent jobs plus the one currently running, if any. */
export async function GET() {
  try {
    const [active, recent] = await Promise.all([
      enrichmentJobService.active(),
      enrichmentJobService.latest(5),
    ])

    return NextResponse.json({ active, recent })
  } catch (error) {
    return apiError(error)
  }
}

/**
 * Starts a job and returns immediately: the run continues on the server even
 * if the client navigates away.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json()

    if (Array.isArray(payload?.ids)) {
      const { ids, renderJavaScript } = enrichmentRequestSchema.parse(payload)
      const job = await enrichmentJobService.start(ids, { renderJavaScript })
      return NextResponse.json(job, { status: 202 })
    }

    const { limit, renderJavaScript } = enrichmentBatchSchema.parse(
      payload ?? {}
    )
    const job = await enrichmentJobService.startPending(limit, {
      renderJavaScript,
    })

    if (!job) {
      return NextResponse.json(
        { message: "Nenhuma empresa pendente de enriquecimento." },
        { status: 409 }
      )
    }

    return NextResponse.json(job, { status: 202 })
  } catch (error) {
    return apiError(error)
  }
}
