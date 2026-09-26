import { describe, expect, it } from "vitest"

import type { Business } from "@/domain/business"
import { ClaudeCliError, parseCliOutput } from "@/lib/claude-cli"
import { buildApproachPrompt, stripDashes } from "@/services/approach.service"

function business(overrides: Partial<Business> = {}): Business {
  return {
    id: "1",
    externalId: "x",
    source: "google",
    name: "Pizzaria Bella",
    category: "Pizzaria",
    rating: 4.7,
    reviewsCount: 812,
    address: { city: "São Paulo", state: "SP" },
    location: {},
    enrichment: { emails: [], socials: {}, technologies: [] },
    status: "NEW",
    searchIds: [],
    collectedAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
    ...overrides,
  }
}

const SELLER = { sellerName: "Júnior", offer: "Sites para restaurantes" }

describe("buildApproachPrompt", () => {
  it("inclui a oferta e os fatos do lead", () => {
    const prompt = buildApproachPrompt(business(), [], SELLER)

    expect(prompt).toContain("Sites para restaurantes")
    expect(prompt).toContain("Pizzaria Bella")
    expect(prompt).toContain("Nota no Google: 4.7")
    expect(prompt).toContain("Número de avaliações: 812")
  })

  it("explicita quando o lead não tem site", () => {
    expect(buildApproachPrompt(business(), [], SELLER)).toContain(
      "Website: não tem website"
    )
  })

  it("omite seções sem dados", () => {
    const prompt = buildApproachPrompt(business(), [], SELLER)

    expect(prompt).not.toContain("Receita Federal")
    expect(prompt).not.toContain("Anotações")
    expect(prompt).not.toContain("Instagram")
  })

  it("inclui Receita, funil e anotações quando existem", () => {
    const prompt = buildApproachPrompt(
      business({
        cnpj: "37437835000113",
        registry: {
          cnpj: "37437835000113",
          fetchedAt: new Date(),
          legalName: "BELLA PIZZAS LTDA",
          secondaryActivities: [],
          phones: [],
          partners: [{ name: "MARIA SILVA", role: "Sócio-Administrador" }],
        },
        pipeline: { stage: "CONTACTED", position: 0, enteredAt: new Date() },
      }),
      [
        {
          id: "n",
          businessId: "1",
          content: "Pediu para retornar semana que vem",
          stage: "CONTACTED",
          createdAt: new Date("2026-09-20"),
          updatedAt: new Date("2026-09-20"),
        },
      ],
      SELLER
    )

    expect(prompt).toContain("37.437.835/0001-13")
    expect(prompt).toContain("MARIA SILVA (Sócio-Administrador)")
    expect(prompt).toContain("Etapa atual: Contatado")
    expect(prompt).toContain(
      "2026-09-20 [Contatado]: Pediu para retornar semana que vem"
    )
  })
})

describe("parseCliOutput", () => {
  it("devolve o structured_output de uma execução bem-sucedida", () => {
    const out = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      structured_output: { hook: "x" },
    })
    expect(parseCliOutput(out)).toEqual({ hook: "x" })
  })

  it("converte uma execução com erro em ClaudeCliError", () => {
    const out = JSON.stringify({
      subtype: "success",
      is_error: true,
      result: "Not logged in",
    })
    expect(() => parseCliOutput(out)).toThrow(ClaudeCliError)
    expect(() => parseCliOutput(out)).toThrow(/Not logged in/)
  })

  it("falha quando falta o structured_output", () => {
    const out = JSON.stringify({ subtype: "success", is_error: false })
    expect(() => parseCliOutput(out)).toThrow(/formato esperado/)
  })

  it("falha com saída que não é JSON", () => {
    expect(() => parseCliOutput("oops")).toThrow(ClaudeCliError)
  })
})

describe("stripDashes", () => {
  it("troca o travessão entre palavras por vírgula", () => {
    expect(stripDashes("Vi o site — muito bom")).toBe("Vi o site, muito bom")
    expect(stripDashes("Júnior – Duarte Software")).toBe(
      "Júnior, Duarte Software"
    )
  })

  it("remove o travessão no começo da linha", () => {
    expect(stripDashes("Abraço,\n— Júnior")).toBe("Abraço,\nJúnior")
  })

  it("não deixa vírgula antes de pontuação", () => {
    expect(stripDashes("é isso —.")).toBe("é isso.")
  })

  it("preserva hífens comuns", () => {
    expect(stripDashes("e-mail e WhatsApp 24h - ok")).toBe(
      "e-mail e WhatsApp 24h - ok"
    )
  })
})
