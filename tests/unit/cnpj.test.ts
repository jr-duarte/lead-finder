import { describe, expect, it, vi } from "vitest"

import { formatCnpj, isValidCnpj, normalizeCnpj } from "@/domain/cnpj"
import { lookupCnpj, parseMinhaReceita } from "@crawler/lookups/cnpj.lookup"
import { extractCnpjs } from "@crawler/parsers/cnpj.parser"
import { extractFromHtml } from "@crawler/parsers/website.parser"
import { enrichOne } from "@crawler/workers/enrich.worker"

const VALID = "37437835000113"

describe("isValidCnpj", () => {
  it("aceita CNPJ válido com ou sem máscara", () => {
    expect(isValidCnpj(VALID)).toBe(true)
    expect(isValidCnpj("37.437.835/0001-13")).toBe(true)
  })

  it("rejeita dígito verificador errado", () => {
    expect(isValidCnpj("37437835000114")).toBe(false)
  })

  it("rejeita sequências repetidas e tamanhos errados", () => {
    expect(isValidCnpj("11111111111111")).toBe(false)
    expect(isValidCnpj("00000000000000")).toBe(false)
    expect(isValidCnpj("3743783500011")).toBe(false)
  })

  it("aceita o formato alfanumérico", () => {
    // Example published by the Receita for the new format.
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true)
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false)
  })
})

describe("formatCnpj / normalizeCnpj", () => {
  it("aplica e remove a máscara", () => {
    expect(formatCnpj(VALID)).toBe("37.437.835/0001-13")
    expect(normalizeCnpj("37.437.835/0001-13")).toBe(VALID)
    expect(formatCnpj(undefined)).toBe("")
  })
})

describe("extractCnpjs", () => {
  it("encontra o CNPJ mascarado no rodapé", () => {
    const html = `<footer><p>Empresa X &copy; 2026 — 37.437.835/0001-13</p></footer>`
    expect(extractCnpjs(html)).toEqual([VALID])
  })

  it("encontra o CNPJ sem máscara quando rotulado", () => {
    expect(extractCnpjs(`<span>CNPJ:</span> <b>${VALID}</b>`)).toEqual([VALID])
    expect(extractCnpjs(`CNPJ/MF nº&nbsp;${VALID}`)).toEqual([VALID])
  })

  it("ignora números de 14 dígitos sem rótulo", () => {
    expect(extractCnpjs(`<a href="tel:${VALID}">x</a> ${VALID}`)).toEqual([])
  })

  it("descarta números com dígito verificador inválido", () => {
    expect(extractCnpjs("CNPJ 37.437.835/0001-14")).toEqual([])
  })

  it("prioriza o CNPJ rotulado", () => {
    const html = `Pagamentos por 33.000.167/0001-01. CNPJ: 37.437.835/0001-13`
    expect(extractCnpjs(html)[0]).toBe(VALID)
  })

  it("não engole as palavras seguintes", () => {
    expect(extractCnpjs("CNPJ 37.437.835/0001-13 INSCRIÇÃO")).toEqual([VALID])
  })

  it("é exposto na extração do site", () => {
    expect(extractFromHtml(`CNPJ: 37.437.835/0001-13`).cnpj).toBe(VALID)
    expect(extractFromHtml(`<p>sem cnpj</p>`).cnpj).toBeUndefined()
  })
})

const PAYLOAD = {
  cnpj: VALID,
  razao_social: "EMPRESA X LTDA",
  nome_fantasia: "",
  descricao_situacao_cadastral: "ATIVA",
  data_situacao_cadastral: "2020-06-17",
  data_inicio_atividade: "2020-06-17",
  porte: "MICRO EMPRESA",
  natureza_juridica: "Sociedade Empresária Limitada",
  cnae_fiscal: 6201501,
  cnae_fiscal_descricao: "Desenvolvimento de programas de computador",
  cnaes_secundarios: [
    { codigo: 0, descricao: "" },
    { codigo: 6204000, descricao: "Consultoria em TI" },
  ],
  capital_social: 500,
  opcao_pelo_simples: true,
  opcao_pelo_mei: false,
  email: "CONTATO@X.COM.BR",
  ddd_telefone_1: "1133334444",
  ddd_telefone_2: "",
  qsa: [
    {
      nome_socio: "FULANO DE TAL",
      qualificacao_socio: "Sócio-Administrador",
      data_entrada_sociedade: "2020-06-17",
    },
  ],
}

describe("parseMinhaReceita", () => {
  it("mapeia o payload e trata vazios como ausentes", () => {
    const registry = parseMinhaReceita(PAYLOAD)

    expect(registry.legalName).toBe("EMPRESA X LTDA")
    expect(registry.tradeName).toBeUndefined()
    expect(registry.mainActivity).toEqual({
      code: "6201501",
      description: "Desenvolvimento de programas de computador",
    })
    expect(registry.secondaryActivities).toEqual([
      { code: "6204000", description: "Consultoria em TI" },
    ])
    expect(registry.email).toBe("contato@x.com.br")
    expect(registry.phones).toEqual(["1133334444"])
    expect(registry.partners).toEqual([
      {
        name: "FULANO DE TAL",
        role: "Sócio-Administrador",
        since: "2020-06-17",
      },
    ])
  })
})

const LOOKUP = {
  endpoint: "https://receita.test/",
  timeoutMs: 2000,
  userAgent: "t",
}

describe("lookupCnpj", () => {
  it("consulta pelo CNPJ normalizado", async () => {
    const fetchImpl = vi.fn(async () => Response.json(PAYLOAD))

    const result = await lookupCnpj("37.437.835/0001-13", {
      ...LOOKUP,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://receita.test/${VALID}`,
      expect.anything()
    )
  })

  it("explica um CNPJ inexistente", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 }))

    const result = await lookupCnpj(VALID, {
      ...LOOKUP,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/não encontrado/),
    })
  })

  it("não lança em falha de rede", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET")
    })

    const result = await lookupCnpj(VALID, {
      ...LOOKUP,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result.ok).toBe(false)
  })
})

describe("enrichOne com CNPJ", () => {
  const CONFIG = { concurrency: 1, delayMs: 0, timeoutMs: 2000, userAgent: "t" }

  function route(url: unknown) {
    if (String(url).startsWith("https://receita.test")) {
      return Response.json(PAYLOAD)
    }
    return new Response(`<title>X</title><footer>CNPJ ${VALID}</footer>`, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    })
  }

  it("extrai o CNPJ do site e consulta a Receita", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => route(url))

    const result = await enrichOne(
      { id: "1", name: "X", website: "https://x.com.br" },
      {
        ...CONFIG,
        cnpjLookupEndpoint: "https://receita.test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(result.cnpj).toBe(VALID)
    expect(result.registry?.legalName).toBe("EMPRESA X LTDA")
    expect(result.registryError).toBeUndefined()
  })

  it("não consulta quando a consulta está desativada", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => route(url))

    const result = await enrichOne(
      { id: "2", name: "X", website: "https://x.com.br" },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.cnpj).toBe(VALID)
    expect(result.registry).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("prefere o CNPJ já cadastrado ao do site", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => route(url))

    const result = await enrichOne(
      {
        id: "3",
        name: "X",
        website: "https://x.com.br",
        cnpj: "33000167000101",
      },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.cnpj).toBe("33000167000101")
  })

  it("mantém o enriquecimento quando a Receita falha", async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).startsWith("https://receita.test")
        ? new Response("", { status: 429 })
        : route(url)
    )

    const result = await enrichOne(
      { id: "4", name: "X", website: "https://x.com.br" },
      {
        ...CONFIG,
        cnpjLookupEndpoint: "https://receita.test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(result.ok).toBe(true)
    expect(result.registry).toBeUndefined()
    expect(result.registryError).toMatch(/429/)
  })
})
