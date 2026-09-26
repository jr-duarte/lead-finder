import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { startTestDatabase } from "../helpers/db"

import { isClosedStage, PIPELINE_COLUMNS } from "@/domain/pipeline"
import { BusinessModel } from "@/models/business.model"
import { pipelineRepository } from "@/repositories/pipeline.repository"
import { dashboardService } from "@/services/dashboard.service"
import { pipelineService } from "@/services/pipeline.service"
import { businessCreateSchema } from "@/schemas/business"
import { addToPipelineSchema, moveCardSchema } from "@/schemas/pipeline"

let database: Awaited<ReturnType<typeof startTestDatabase>>

/**
 * Counter-based ids: two seed() calls in the same millisecond would otherwise
 * collide on the unique (source, externalId) index and silently insert fewer
 * documents than requested.
 */
let seedCounter = 0

async function seed(names: string[]): Promise<string[]> {
  const docs = await BusinessModel.insertMany(
    names.map((name) => ({
      name,
      source: "manual",
      externalId: `seed-${(seedCounter += 1)}`,
      collectedAt: new Date(),
    }))
  )
  return docs.map((doc) => String(doc._id))
}

beforeAll(async () => {
  database = await startTestDatabase("pipeline")
}, 120_000)

afterAll(async () => {
  await database.stop()
})

afterEach(async () => {
  await BusinessModel.deleteMany({})
})

describe("domínio do funil", () => {
  it("tem as sete colunas na ordem do funil", () => {
    expect(PIPELINE_COLUMNS).toEqual([
      "NEW",
      "CONTACTED",
      "REPLIED",
      "MEETING",
      "PROPOSAL",
      "WON",
      "LOST",
    ])
  })

  it("identifica os estágios que encerram o funil", () => {
    expect(isClosedStage("WON")).toBe(true)
    expect(isClosedStage("LOST")).toBe(true)
    expect(isClosedStage("MEETING")).toBe(false)
  })

  it("entra em Novo por padrão", () => {
    expect(addToPipelineSchema.parse({ ids: ["a"] }).stage).toBe("NEW")
  })

  it("recusa um estágio inexistente", () => {
    expect(() => moveCardSchema.parse({ stage: "ARQUIVADO" })).toThrow()
  })
})

describe("pipelineRepository", () => {
  it("adiciona leads em sequência dentro da coluna", async () => {
    const ids = await seed(["A", "B", "C"])
    const added = await pipelineRepository.add(ids, "NEW")

    expect(added).toBe(3)

    const board = await pipelineRepository.board()
    expect(board.map((b) => b.pipeline?.position)).toEqual([0, 1, 2])
  })

  it("não adiciona duas vezes o mesmo lead", async () => {
    const ids = await seed(["A", "B"])
    await pipelineRepository.add(ids, "NEW")

    // Re-adding must be a no-op rather than duplicating the card.
    const again = await pipelineRepository.add(ids, "CONTACTED")
    expect(again).toBe(0)

    const board = await pipelineRepository.board()
    expect(board).toHaveLength(2)
    expect(board.every((b) => b.pipeline?.stage === "NEW")).toBe(true)
  })

  it("move um card entre colunas", async () => {
    const [id] = await seed(["A"])
    await pipelineRepository.add([id], "NEW")

    const moved = await pipelineRepository.move(id, "MEETING")

    expect(moved?.pipeline?.stage).toBe("MEETING")
    expect(moved?.pipeline?.movedAt).toBeDefined()
  })

  it("empurra os cards abaixo ao inserir numa posição", async () => {
    const ids = await seed(["A", "B", "C"])
    await pipelineRepository.add(ids, "NEW")
    const [, , third] = ids

    // Moving the last card to the top must not collide with existing ones.
    await pipelineRepository.move(third, "NEW", 0)

    const board = await pipelineRepository.board()
    const positions = board
      .map((b) => b.pipeline?.position ?? 0)
      .sort((a, b) => a - b)

    expect(new Set(positions).size).toBe(3)
  })

  it("remove do funil sem apagar a empresa", async () => {
    const ids = await seed(["A"])
    await pipelineRepository.add(ids, "NEW")

    const removed = await pipelineRepository.remove(ids)

    expect(removed).toBe(1)
    expect(await pipelineRepository.board()).toHaveLength(0)
    // The business itself must survive.
    expect(await BusinessModel.countDocuments()).toBe(1)
  })

  it("conta os leads por estágio", async () => {
    const ids = await seed(["A", "B", "C"])
    await pipelineRepository.add(ids, "NEW")
    await pipelineRepository.move(ids[0], "WON")

    const counts = await pipelineRepository.countByStage()

    expect(counts.NEW).toBe(2)
    expect(counts.WON).toBe(1)
  })
})

describe("pipelineService.board", () => {
  it("devolve as sete colunas, mesmo vazias", async () => {
    const columns = await pipelineService.board()

    expect(columns).toHaveLength(7)
    expect(columns[0].label).toBe("Novo")
    expect(columns.every((c) => c.cards.length === 0)).toBe(true)
  })

  it("agrupa os cards na coluna certa", async () => {
    const ids = await seed(["A", "B"])
    await pipelineService.add(ids, "NEW")
    await pipelineService.move(ids[0], "PROPOSAL")

    const columns = await pipelineService.board()
    const byStage = Object.fromEntries(
      columns.map((c) => [c.stage, c.cards.length])
    )

    expect(byStage.NEW).toBe(1)
    expect(byStage.PROPOSAL).toBe(1)
  })
})

describe("cadastro manual", () => {
  it("exige apenas o nome", () => {
    expect(() =>
      businessCreateSchema.parse({ name: "Bar do Zé" })
    ).not.toThrow()
    expect(() => businessCreateSchema.parse({ name: "" })).toThrow()
  })

  it("valida website e e-mail quando informados", () => {
    expect(() =>
      businessCreateSchema.parse({ name: "X", website: "nao-e-url" })
    ).toThrow()
    expect(() =>
      businessCreateSchema.parse({ name: "X", email: "invalido" })
    ).toThrow()
    expect(() =>
      businessCreateSchema.parse({
        name: "X",
        website: "https://x.com.br",
        email: "a@x.com.br",
      })
    ).not.toThrow()
  })
})

describe("alterar etapa fora do board", () => {
  it("move a empresa e registra quando foi movida", async () => {
    const [id] = await seed(["A"])
    await pipelineRepository.add([id], "NEW")

    const moved = await pipelineRepository.move(id, "WON")

    expect(moved?.pipeline?.stage).toBe("WON")
    expect(moved?.pipeline?.movedAt).toBeDefined()
  })

  it("permite voltar a uma etapa anterior", async () => {
    const [id] = await seed(["A"])
    await pipelineRepository.add([id], "NEW")
    await pipelineRepository.move(id, "PROPOSAL")

    // A deal can regress; the funnel is not one-way.
    const back = await pipelineRepository.move(id, "CONTACTED")

    expect(back?.pipeline?.stage).toBe("CONTACTED")
  })

  it("mantém o lead no board ao trocar de etapa", async () => {
    const [id] = await seed(["A"])
    await pipelineRepository.add([id], "NEW")
    await pipelineRepository.move(id, "LOST")

    const board = await pipelineRepository.board()
    expect(board).toHaveLength(1)
    expect(board[0].pipeline?.stage).toBe("LOST")
  })
})

describe("métricas do funil no dashboard", () => {
  it("separa ganhos, perdidos e em andamento", async () => {
    const ids = await seed(["A", "B", "C", "D", "E"])
    await pipelineRepository.add(ids, "NEW")

    await pipelineRepository.move(ids[0], "WON")
    await pipelineRepository.move(ids[1], "WON")
    await pipelineRepository.move(ids[2], "LOST")
    await pipelineRepository.move(ids[3], "MEETING")
    // ids[4] stays in NEW.

    const { funnel } = await dashboardService.getData()

    expect(funnel.won).toBe(2)
    expect(funnel.lost).toBe(1)
    // Every open stage rolls into a single number.
    expect(funnel.inProgress).toBe(2)
  })

  it("o total cobre todo o board", async () => {
    const ids = await seed(["A", "B", "C"])
    await pipelineRepository.add(ids, "NEW")
    await pipelineRepository.move(ids[0], "WON")

    const { funnel } = await dashboardService.getData()

    expect(funnel.total).toBe(3)
    expect(funnel.won + funnel.lost + funnel.inProgress).toBe(funnel.total)
  })

  it("calcula a conversão sobre as encerradas, não sobre o total", async () => {
    const ids = await seed(["A", "B", "C", "D"])
    await pipelineRepository.add(ids, "NEW")

    await pipelineRepository.move(ids[0], "WON")
    await pipelineRepository.move(ids[1], "WON")
    await pipelineRepository.move(ids[2], "LOST")
    // ids[3] is still open and must not dilute the rate.

    const { funnel } = await dashboardService.getData()

    expect(funnel.winRate).toBeCloseTo(66.67, 1)
  })

  it("não divide por zero quando nada foi encerrado", async () => {
    const ids = await seed(["A"])
    await pipelineRepository.add(ids, "NEW")

    const { funnel } = await dashboardService.getData()

    expect(funnel.winRate).toBe(0)
    expect(funnel.inProgress).toBe(1)
  })

  it("zera quando o funil está vazio", async () => {
    const { funnel } = await dashboardService.getData()

    expect(funnel).toMatchObject({
      won: 0,
      lost: 0,
      inProgress: 0,
      total: 0,
      winRate: 0,
    })
  })

  it("ignora empresas que não estão no funil", async () => {
    await seed(["Fora do funil"])
    const [dentro] = await seed(["No funil"])
    await pipelineRepository.add([dentro], "WON")

    const { funnel } = await dashboardService.getData()

    expect(funnel.total).toBe(1)
    expect(funnel.won).toBe(1)
  })
})
