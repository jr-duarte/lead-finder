import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { noteRepository } from "@/repositories/note.repository"
import { noteUpdateSchema } from "@/schemas/note"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const { content } = noteUpdateSchema.parse(await request.json())
    const note = await noteRepository.update(id, content)

    if (!note) {
      return NextResponse.json(
        { message: "Anotação não encontrada." },
        { status: 404 }
      )
    }

    return NextResponse.json(note)
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const removed = await noteRepository.remove(id)

    if (!removed) {
      return NextResponse.json(
        { message: "Anotação não encontrada." },
        { status: 404 }
      )
    }

    return NextResponse.json({ removed: 1 })
  } catch (error) {
    return apiError(error)
  }
}
