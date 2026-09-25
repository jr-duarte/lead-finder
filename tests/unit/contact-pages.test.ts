import { describe, expect, it, vi } from "vitest"

import {
  findContactLinks,
  mergeExtractions,
} from "@crawler/parsers/website.parser"
import { enrichOne } from "@crawler/workers/enrich.worker"

const BASE = "https://clinica.com.br"

describe("findContactLinks", () => {
  it("ranks a contact link above a generic one", () => {
    const html = `
      <a href="/sobre">Sobre nós</a>
      <a href="/contato">Fale conosco</a>
      <a href="/blog">Blog</a>
    `
    const links = findContactLinks(html, BASE)

    expect(links[0]).toBe(`${BASE}/contato`)
  })

  it("matches the label even when wrapped in tags", () => {
    const html = `<a href="/c"><span>Contato</span></a>`
    expect(findContactLinks(html, BASE)).toEqual([`${BASE}/c`])
  })

  it("resolves relative URLs against the site", () => {
    const html = `<a href="contato.php">Contato</a>`
    expect(findContactLinks(html, `${BASE}/home/`)).toEqual([
      `${BASE}/home/contato.php`,
    ])
  })

  it("ignores links to other domains", () => {
    const html = `<a href="https://outra.com/contato">Contato</a>`
    expect(findContactLinks(html, BASE)).toEqual([])
  })

  it("ignores mailto, tel and file links", () => {
    const html = `
      <a href="mailto:a@b.com">Contato</a>
      <a href="tel:+551199999">Contato</a>
      <a href="/contato.pdf">Contato</a>
    `
    expect(findContactLinks(html, BASE)).toEqual([])
  })

  it("ignores links with no contact signal", () => {
    const html = `<a href="/produtos">Nossos produtos</a>`
    expect(findContactLinks(html, BASE)).toEqual([])
  })

  it("respects the requested limit", () => {
    const html = `
      <a href="/contato">Contato</a>
      <a href="/fale-conosco">Fale conosco</a>
      <a href="/sobre">Sobre</a>
    `
    expect(findContactLinks(html, BASE, 2)).toHaveLength(2)
  })
})

describe("mergeExtractions", () => {
  it("keeps the home page title and unions the contact data", () => {
    const merged = mergeExtractions([
      { title: "Home", emails: [], technologies: ["WordPress"] },
      {
        title: "Contato",
        emails: ["contato@x.com.br"],
        instagram: "clinicax",
        technologies: ["Meta Pixel"],
      },
    ])

    expect(merged.title).toBe("Home")
    expect(merged.emails).toEqual(["contato@x.com.br"])
    expect(merged.instagram).toBe("clinicax")
    expect(merged.technologies).toEqual(["WordPress", "Meta Pixel"])
  })

  it("does not let a later page override a value already found", () => {
    const merged = mergeExtractions([
      { emails: ["home@x.com"], instagram: "daHome", technologies: [] },
      { emails: ["contato@x.com"], instagram: "doContato", technologies: [] },
    ])

    expect(merged.instagram).toBe("daHome")
    expect(merged.emails).toEqual(["home@x.com", "contato@x.com"])
  })

  it("handles an empty input", () => {
    expect(mergeExtractions([])).toEqual({ emails: [], technologies: [] })
  })
})

const CONFIG = {
  concurrency: 1,
  delayMs: 0,
  timeoutMs: 2000,
  userAgent: "test",
}

function html(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  })
}

describe("enrichOne seguindo páginas de contato", () => {
  it("busca o e-mail na página de contato quando a home não tem", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).includes("/contato")) {
        return html(`<a href="mailto:contato@clinica.com.br">E-mail</a>`)
      }
      return html(`<title>Clínica</title><a href="/contato">Contato</a>`)
    })

    const result = await enrichOne(
      { id: "1", name: "Clínica", website: BASE },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.ok).toBe(true)
    expect(result.emails).toEqual(["contato@clinica.com.br"])
    expect(result.websiteTitle).toBe("Clínica")
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("não segue links quando a home já tem e-mail", async () => {
    const fetchImpl = vi.fn(async () =>
      html(
        `<a href="mailto:oi@clinica.com.br">x</a><a href="/contato">Contato</a>`
      )
    )

    const result = await enrichOne(
      { id: "2", name: "Clínica", website: BASE },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result.emails).toEqual(["oi@clinica.com.br"])
    // Saves a request when the home already answered.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("não falha quando a página de contato está fora do ar", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).includes("/contato")) {
        return new Response("erro", { status: 500 })
      }
      return html(`<title>Clínica</title><a href="/contato">Contato</a>`)
    })

    const result = await enrichOne(
      { id: "3", name: "Clínica", website: BASE },
      { ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    // The home succeeded, so the enrichment still counts as a success.
    expect(result.ok).toBe(true)
    expect(result.emails).toEqual([])
  })

  it("permite desativar o seguimento de links", async () => {
    const fetchImpl = vi.fn(async () =>
      html(`<title>X</title><a href="/contato">Contato</a>`)
    )

    await enrichOne(
      { id: "4", name: "Clínica", website: BASE },
      {
        ...CONFIG,
        maxContactPages: 0,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
