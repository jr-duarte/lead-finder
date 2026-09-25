import { NextResponse } from "next/server"

import { apiError, searchParamsToObject } from "@/lib/api"
import { searchFormSchema, searchListQuerySchema } from "@/schemas/search"
import { searchService } from "@/services/search.service"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { page, pageSize } = searchListQuerySchema.parse(
      searchParamsToObject(request.url)
    )
    const result = await searchService.list(page, pageSize)
    return NextResponse.json(result)
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const input = searchFormSchema.parse(await request.json())
    const search = await searchService.start(input)
    return NextResponse.json(search, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
