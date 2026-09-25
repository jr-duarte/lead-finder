import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { dashboardService } from "@/services/dashboard.service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = await dashboardService.getData()
    return NextResponse.json(data)
  } catch (error) {
    return apiError(error)
  }
}
