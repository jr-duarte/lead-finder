import { NextResponse } from "next/server"

import { apiError, searchParamsToObject } from "@/lib/api"
import {
  businessCreateSchema,
  businessFiltersSchema,
  businessIdsSchema,
} from "@/schemas/business"
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

export async function POST(request: Request) {
  try {
    const input = businessCreateSchema.parse(await request.json())
    const business = await businessService.create(input)

    return NextResponse.json(business, { status: 201 })
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
