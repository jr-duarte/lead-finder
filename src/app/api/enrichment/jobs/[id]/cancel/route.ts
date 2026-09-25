import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { enrichmentJobService } from "@/services/enrichment.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const job = await enrichmentJobService.cancel(id)

    if (!job) {
      return NextResponse.json(
        { message: "Execução não encontrada." },
        { status: 404 }
      )
    }

    return NextResponse.json(job)
  } catch (error) {
    return apiError(error)
  }
}
