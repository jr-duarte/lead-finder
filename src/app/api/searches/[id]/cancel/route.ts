import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { searchService } from "@/services/search.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const search = await searchService.cancel(id)

    if (!search) {
      return NextResponse.json(
        { message: "Busca não encontrada." },
        { status: 404 }
      )
    }

    return NextResponse.json(search)
  } catch (error) {
    return apiError(error)
  }
}
