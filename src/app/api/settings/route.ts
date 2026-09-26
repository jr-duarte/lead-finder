import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { settingsRepository } from "@/repositories/settings.repository"
import { sellerProfileSchema } from "@/schemas/settings"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const seller = await settingsRepository.getSeller()
    return NextResponse.json({ seller })
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const input = sellerProfileSchema.parse(await request.json())
    const seller = await settingsRepository.updateSeller(input)
    return NextResponse.json({ seller })
  } catch (error) {
    return apiError(error)
  }
}
