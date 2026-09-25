import { NextResponse } from "next/server"

import { apiError, searchParamsToObject } from "@/lib/api"
import { businessFiltersSchema, businessIdsSchema } from "@/schemas/business"
import { businessService } from "@/services/business.service"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const filters = businessFiltersSchema.parse(
      searchParamsToObject(request.url)
    )
    const result = await businessService.list(filters)
    return NextResponse.json(result)
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const { ids } = businessIdsSchema.parse(await request.json())
    const deleted = await businessService.deleteMany(ids)
    return NextResponse.json({ deleted })
  } catch (error) {
    return apiError(error)
  }
}
