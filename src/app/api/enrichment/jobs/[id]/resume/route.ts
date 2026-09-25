import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { enrichmentJobService } from "@/services/enrichment.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const job = await enrichmentJobService.resume(id)

    if (!job) {
      return NextResponse.json(
        { message: "Não há itens restantes para retomar." },
        { status: 409 }
      )
    }

    return NextResponse.json(job, { status: 202 })
  } catch (error) {
    return apiError(error)
  }
}
