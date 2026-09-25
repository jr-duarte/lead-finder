import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { businessService } from "@/services/business.service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const options = await businessService.filterOptions()
    return NextResponse.json(options)
  } catch (error) {
    return apiError(error)
  }
}
