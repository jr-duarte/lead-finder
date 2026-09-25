import { MongoMemoryServer } from "mongodb-memory-server"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { connectToDatabase, disconnectFromDatabase } from "@/lib/mongoose"
import { BusinessModel } from "@/models/business.model"
import { NoteModel } from "@/models/note.model"
import { buildBusinessQuery } from "@/repositories/business.repository"
import { noteRepository } from "@/repositories/note.repository"
import { pipelineRepository } from "@/repositories/pipeline.repository"
import { businessFiltersSchema } from "@/schemas/business"
import { noteCreateSchema } from "@/schemas/note"

let server: MongoMemoryServer

const parse = (input: Record<string, unknown> = {}) =>
  businessFiltersSchema.parse(input)

async function seedBusiness(name = "Empresa"): Promise<string> {
  const doc = await BusinessModel.create({
    name,
    source: "manual",
    externalId: `note-${Date.now()}-${Math.random()}`,
    collectedAt: new Date(),
  })
  return String(doc._id)
}

beforeAll(async () => {
  server = await MongoMemoryServer.create()
  process.env.MONGODB_URI = server.getUri("notes-test")
  await connectToDatabase()
}, 120_000)

afterAll(async () => {
  await disconnectFromDatabase()
  await server.stop()
})

afterEach(async () => {
  await Promise.all([BusinessModel.deleteMany({}), NoteModel.deleteMany({})])
})

describe("noteCreateSchema", () => {
  it("exige conteúdo e limita o tamanho", () => {
    expect(() => noteCreateSchema.parse({ content: "" })).toThrow()
    expect(() => noteCreateSchema.parse({ content: "  " })).toThrow()
    expect(() =>
      noteCreateSchema.parse({ content: "x".repeat(2001) })
    ).toThrow()
    expect(noteCreateSchema.parse({ content: " ok " }).content).toBe("ok")
  })
})

describe("noteRepository", () => {
  it("registra a etapa do funil no momento da anotação", async () => {
    const id = await seedBusiness()
    await pipelineRepository.add([id], "NEW")
    await pipelineRepository.move(id, "MEETING")

    const note = await noteRepository.create(id, "Reunião marcada")

    expect(note?.stage).toBe("MEETING")
  })

  it("mantém a etapa histórica mesmo após o lead avançar", async () => {
    const id = await seedBusiness()
    await pipelineRepository.add([id], "NEW")
    await noteRepository.create(id, "Primeiro contato")

    // Moving the lead must not rewrite what the note recorded.
    await pipelineRepository.move(id, "WON")
    const [note] = await noteRepository.listByBusiness(id)

    expect(note.stage).toBe("NEW")
  })

  it("grava sem etapa quando o lead está fora do funil", async () => {
    const id = await seedBusiness()
    const note = await noteRepository.create(id, "Anotação solta")

    expect(note?.stage).toBeUndefined()
  })

  it("lista da mais recente para a mais antiga", async () => {
    const id = await seedBusiness()
    await noteRepository.create(id, "Primeira")
    await new Promise((resolve) => setTimeout(resolve, 10))
    await noteRepository.create(id, "Segunda")

    const notes = await noteRepository.listByBusiness(id)

    expect(notes[0].content).toBe("Segunda")
  })

  it("edita e exclui uma anotação", async () => {
    const id = await seedBusiness()
    const note = await noteRepository.create(id, "Rascunho")

    const updated = await noteRepository.update(note!.id, "Versão final")
    expect(updated?.content).toBe("Versão final")

    expect(await noteRepository.remove(note!.id)).toBe(true)
    expect(await noteRepository.listByBusiness(id)).toHaveLength(0)
  })

  it("remove as anotações junto com a empresa", async () => {
    const id = await seedBusiness()
    await noteRepository.create(id, "A")
    await noteRepository.create(id, "B")

    const removed = await noteRepository.removeByBusiness([id])

    expect(removed).toBe(2)
    expect(await NoteModel.countDocuments()).toBe(0)
  })

  it("não vaza anotações entre empresas", async () => {
    const [a, b] = [await seedBusiness("A"), await seedBusiness("B")]
    await noteRepository.create(a, "Da empresa A")

    expect(await noteRepository.listByBusiness(b)).toHaveLength(0)
  })
})

describe("filtro de funil na listagem", () => {
  it("lista somente quem está no funil", () => {
    const query = buildBusinessQuery(parse({ pipeline: "in" }))
    expect(query.$and).toContainEqual({ pipeline: { $exists: true } })
  })

  it("lista somente quem está fora", () => {
    const query = buildBusinessQuery(parse({ pipeline: "out" }))
    expect(query.$and).toContainEqual({ pipeline: { $exists: false } })
  })

  it("filtra por uma etapa específica", () => {
    const query = buildBusinessQuery(parse({ pipelineStage: "PROPOSAL" }))
    expect(query.$and).toContainEqual({ "pipeline.stage": "PROPOSAL" })
  })

  it("a etapa tem precedência sobre o filtro genérico", () => {
    const query = buildBusinessQuery(
      parse({ pipeline: "out", pipelineStage: "WON" })
    )

    // Asking for a stage implies being on the board.
    expect(query.$and).toContainEqual({ "pipeline.stage": "WON" })
    expect(query.$and).not.toContainEqual({ pipeline: { $exists: false } })
  })
})
