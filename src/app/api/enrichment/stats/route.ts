import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { enrichmentService } from "@/services/enrichment.service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const stats = await enrichmentService.stats()
    return NextResponse.json(stats)
  } catch (error) {
    return apiError(error)
  }
}
