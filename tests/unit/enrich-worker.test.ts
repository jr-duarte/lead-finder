import { describe, expect, it, vi } from "vitest"

import { enrichMany, enrichOne } from "@crawler/workers/enrich.worker"

const CONFIG = {
  concurrency: 2,
  delayMs: 0,
  timeoutMs: 2000,
  userAgent: "test-agent",
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html" },
  })
}

describe("enrichOne", () => {
  it("extracts contact data from the fetched page", async () => {
    const fetchImpl = vi.fn(async () =>
      htmlResponse(
        `<title>Loja</title><a href="mailto:oi@loja.com.br">x</a>
         <a href="https://instagram.com/loja.oficial">ig</a>`
      )
    )

    const result = await enrichOne(
      { id: "1", name: "Loja", website: "https://loja.com.br" },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.ok).toBe(true)
    expect(result.websiteStatus).toBe(200)
    expect(result.websiteTitle).toBe("Loja")
    expect(result.emails).toEqual(["oi@loja.com.br"])
    expect(result.socials.instagram).toBe("loja.oficial")
  })

  it("always carries the error key, so a success clears a previous error", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("<title>ok</title>"))

    const result = await enrichOne(
      { id: "5", name: "Loja", website: "https://loja.com.br" },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
    // The key must exist for the repository to $unset the stored value.
    expect(Object.keys(result)).toContain("error")
  })

  it("reports businesses with no website instead of fetching", async () => {
    const fetchImpl = vi.fn()

    const result = await enrichOne(
      { id: "2", name: "Sem site" },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/sem website/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("records a failing HTTP status", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("nope", 404))

    const result = await enrichOne(
      { id: "3", name: "Quebrado", website: "https://quebrado.com.br" },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.ok).toBe(false)
    expect(result.websiteStatus).toBe(404)
    expect(result.error).toMatch(/404/)
  })

  it("does not throw when the request fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED")
    })

    const result = await enrichOne(
      { id: "4", name: "Offline", website: "https://offline.com.br" },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.ok).toBe(false)
    // The raw code is translated into something the user can act on.
    expect(result.error).toMatch(/recusou a conexão/)
  })
})

describe("enrichMany", () => {
  it("returns one outcome per target, keeping order", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("<title>ok</title>"))

    const results = await enrichMany(
      [
        { id: "a", name: "A", website: "https://a.com.br" },
        { id: "b", name: "B" },
        { id: "c", name: "C", website: "https://c.com.br" },
      ],
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(results.map((result) => result.id)).toEqual(["a", "b", "c"])
    expect(results.map((result) => result.ok)).toEqual([true, false, true])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe("describeHttpFailure", () => {
  it("explains a broken site instead of showing a bare status", async () => {
    const { describeHttpFailure } =
      await import("@crawler/workers/enrich.worker")

    expect(describeHttpFailure(500)).toMatch(/fora do ar/)
    expect(describeHttpFailure(503)).toMatch(/fora do ar/)
  })

  it("distinguishes a missing page from a block", async () => {
    const { describeHttpFailure } =
      await import("@crawler/workers/enrich.worker")

    expect(describeHttpFailure(404)).toMatch(/não encontrada/)
    expect(describeHttpFailure(403)).toMatch(/bloqueou/)
    expect(describeHttpFailure(429)).toMatch(/limitou/)
  })

  it("falls back to the status for anything unusual", async () => {
    const { describeHttpFailure } =
      await import("@crawler/workers/enrich.worker")

    expect(describeHttpFailure(418)).toContain("418")
  })
})

describe("classificação de resultados", () => {
  it("marca empresa sem website como ignorada, não como falha", async () => {
    const result = await enrichOne(
      { id: "x", name: "Sem site" },
      { ...CONFIG, fetchImpl: vi.fn() as unknown as typeof fetch }
    )

    // It was never enrichable, so it must not pollute the failure ratio.
    expect(result.skipped).toBe(true)
    expect(result.ok).toBe(false)
  })

  it("não marca como ignorada uma falha real de rede", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED")
    })

    const result = await enrichOne(
      { id: "y", name: "Offline", website: "https://offline.com.br" },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.skipped).toBeFalsy()
    expect(result.ok).toBe(false)
  })
})
