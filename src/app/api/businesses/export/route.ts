import { apiError, searchParamsToObject } from "@/lib/api"
import { businessFiltersSchema } from "@/schemas/business"
import { businessService } from "@/services/business.service"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const filters = businessFiltersSchema.parse(
      searchParamsToObject(request.url)
    )
    const csv = await businessService.exportCsv(filters)
    const filename = `empresas-${new Date().toISOString().slice(0, 10)}.csv`

    // BOM keeps accented characters readable when opened in Excel.
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return apiError(error)
  }
}
