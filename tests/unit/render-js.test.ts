import { describe, expect, it, vi } from "vitest"

import { enrichOne, looksClientRendered } from "@crawler/workers/enrich.worker"

describe("looksClientRendered", () => {
  it("detects a React shell with an empty mount node", () => {
    const html = `
      <html><body>
        <div id="root"></div>
        <script src="/static/js/bundle.js"></script>
      </body></html>
    `
    expect(looksClientRendered(html)).toBe(true)
  })

  it("detects a Next.js shell", () => {
    expect(
      looksClientRendered(`<div id="__next"></div><script src="/_next/x.js">`)
    ).toBe(true)
  })

  it("does not flag a server-rendered page with real content", () => {
    const html = `
      <html><body>
        <h1>Clínica Odontológica</h1>
        <p>${"Atendimento humanizado em Santana. ".repeat(30)}</p>
        <a href="mailto:contato@clinica.com.br">contato@clinica.com.br</a>
      </body></html>
    `
    expect(looksClientRendered(html)).toBe(false)
  })

  it("ignores script bulk when measuring content", () => {
    // Plenty of bytes, but almost no readable text.
    const html = `<div id="app"></div><script>${"var x=1;".repeat(2000)}</script>`
    expect(looksClientRendered(html)).toBe(true)
  })
})

const CONFIG = {
  concurrency: 1,
  delayMs: 0,
  timeoutMs: 2000,
  userAgent: "test",
  maxContactPages: 0,
}

const SHELL = `<html><body><div id="root"></div><script src="/b.js"></script></body></html>`
const RENDERED = `<html><body><h1>Clínica</h1><a href="mailto:contato@clinica.com.br">e-mail</a></body></html>`

function html(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  })
}

describe("enrichOne com renderização", () => {
  it("usa o HTML renderizado quando a página vem vazia", async () => {
    const fetchImpl = vi.fn(async () => html(SHELL))
    const render = vi.fn(async () => RENDERED)

    const result = await enrichOne(
      { id: "1", name: "Clínica", website: "https://clinica.com.br" },
      {
        ...CONFIG,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        renderer: { render },
      }
    )

    expect(render).toHaveBeenCalledOnce()
    expect(result.emails).toEqual(["contato@clinica.com.br"])
  })

  it("não aciona o navegador quando o HTML já tem conteúdo", async () => {
    const fetchImpl = vi.fn(async () =>
      html(
        `<h1>Clínica</h1><p>${"Atendimento em Santana. ".repeat(40)}</p>
         <a href="mailto:oi@clinica.com.br">oi</a>`
      )
    )
    const render = vi.fn(async () => RENDERED)

    const result = await enrichOne(
      { id: "2", name: "Clínica", website: "https://clinica.com.br" },
      {
        ...CONFIG,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        renderer: { render },
      }
    )

    // Rendering is expensive, so it must be skipped when unnecessary.
    expect(render).not.toHaveBeenCalled()
    expect(result.emails).toEqual(["oi@clinica.com.br"])
  })

  it("mantém o HTML original quando a renderização falha", async () => {
    const fetchImpl = vi.fn(async () => html(SHELL))
    const render = vi.fn(async () => null)

    const result = await enrichOne(
      { id: "3", name: "Clínica", website: "https://clinica.com.br" },
      {
        ...CONFIG,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        renderer: { render },
      }
    )

    // A failed render must not fail the enrichment.
    expect(result.ok).toBe(true)
    expect(result.emails).toEqual([])
  })

  it("não renderiza quando nenhum renderer é fornecido", async () => {
    const fetchImpl = vi.fn(async () => html(SHELL))

    const result = await enrichOne(
      { id: "4", name: "Clínica", website: "https://clinica.com.br" },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.ok).toBe(true)
    expect(result.emails).toEqual([])
  })
})

describe("enrichMany com renderização", () => {
  it("aciona o navegador apenas nas páginas que chegam vazias", async () => {
    const complete = `<h1>Clínica</h1><p>${"Atendimento em Santana. ".repeat(40)}</p>`
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes("spa") ? html(SHELL) : html(complete)
    )

    const rendered: string[] = []

    const { enrichMany } = await import("@crawler/workers/enrich.worker")
    await enrichMany(
      [
        { id: "1", name: "Completo", website: "https://completo.com.br" },
        { id: "2", name: "SPA", website: "https://spa.com.br" },
      ],
      {
        ...CONFIG,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        renderJavaScript: true,
        renderer: {
          render: async (url) => {
            rendered.push(url)
            return RENDERED
          },
        },
      }
    )

    // Rendering is expensive, so a complete page must never pay for it.
    expect(rendered).toHaveLength(1)
    expect(rendered[0]).toContain("spa.com.br")
  })

  it("usa o renderer injetado em vez de abrir um navegador próprio", async () => {
    const fetchImpl = vi.fn(async () => html(SHELL))
    const render = vi.fn(async () => RENDERED)

    const { enrichMany } = await import("@crawler/workers/enrich.worker")
    const [outcome] = await enrichMany(
      [{ id: "1", name: "SPA", website: "https://spa.com.br" }],
      {
        ...CONFIG,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        renderJavaScript: true,
        renderer: { render },
      }
    )

    expect(render).toHaveBeenCalledOnce()
    expect(outcome.emails).toEqual(["contato@clinica.com.br"])
  })
})
