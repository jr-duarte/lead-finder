import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { noteRepository } from "@/repositories/note.repository"
import { noteCreateSchema } from "@/schemas/note"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const notes = await noteRepository.listByBusiness(id)
    return NextResponse.json({ notes })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const { content } = noteCreateSchema.parse(await request.json())
    const note = await noteRepository.create(id, content)

    if (!note) {
      return NextResponse.json(
        { message: "Empresa não encontrada." },
        { status: 404 }
      )
    }

    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
