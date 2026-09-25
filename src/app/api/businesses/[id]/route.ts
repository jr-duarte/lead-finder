import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { businessUpdateSchema } from "@/schemas/business"
import { businessService } from "@/services/business.service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const business = await businessService.getById(id)

    if (!business) {
      return NextResponse.json(
        { message: "Empresa não encontrada." },
        { status: 404 }
      )
    }

    return NextResponse.json(business)
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const input = businessUpdateSchema.parse(await request.json())
    const business = await businessService.update(id, input)

    if (!business) {
      return NextResponse.json(
        { message: "Empresa não encontrada." },
        { status: 404 }
      )
    }

    return NextResponse.json(business)
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const deleted = await businessService.deleteMany([id])
    return NextResponse.json({ deleted })
  } catch (error) {
    return apiError(error)
  }
}
