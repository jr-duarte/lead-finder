import { describe, expect, it } from "vitest"

import { extractFromHtml } from "@crawler/parsers/website.parser"
import { normalizeInstagram } from "@crawler/parsers/place.parser"

describe("extração de Facebook", () => {
  it("ignora a central de ajuda da Meta", () => {
    // Exactly what an Instagram page exposes in its footer.
    const html = `<a href="https://www.facebook.com/help/">Ajuda</a>`
    expect(extractFromHtml(html).facebook).toBeUndefined()
  })

  it("ignora páginas institucionais e o pixel", () => {
    for (const path of [
      "privacy",
      "policies",
      "terms",
      "login",
      "tr",
      "sharer",
    ]) {
      const html = `<a href="https://www.facebook.com/${path}">x</a>`
      expect(extractFromHtml(html).facebook).toBeUndefined()
    }
  })

  it("encontra o perfil real mesmo depois de um link institucional", () => {
    const html = `
      <a href="https://www.facebook.com/help">Ajuda</a>
      <a href="https://www.facebook.com/clinicasalvi">Nossa página</a>
    `
    expect(extractFromHtml(html).facebook).toBe("clinicasalvi")
  })

  it("ignora ids numéricos de plugin", () => {
    const html = `<a href="https://www.facebook.com/1234567890">x</a>`
    expect(extractFromHtml(html).facebook).toBeUndefined()
  })

  it("aceita um perfil comum", () => {
    const html = `<a href="https://facebook.com/salvi.cozinha">Facebook</a>`
    expect(extractFromHtml(html).facebook).toBe("salvi.cozinha")
  })
})

describe("extração de Instagram", () => {
  it("ignora caminhos da plataforma", () => {
    for (const path of ["p", "reel", "explore", "accounts", "about", "legal"]) {
      expect(
        normalizeInstagram(`https://instagram.com/${path}/`)
      ).toBeUndefined()
    }
  })

  it("encontra o perfil mesmo após um link de post", () => {
    const html = `
      <a href="https://www.instagram.com/p/Cabc123/">Post</a>
      <a href="https://www.instagram.com/salvi.cozinha/">Perfil</a>
    `
    expect(extractFromHtml(html).instagram).toBe("salvi.cozinha")
  })
})

describe("extração de LinkedIn", () => {
  it("ignora páginas da plataforma", () => {
    const html = `<a href="https://www.linkedin.com/company/help">x</a>`
    expect(extractFromHtml(html).linkedin).toBeUndefined()
  })

  it("aceita uma empresa real, preservando o tipo do perfil", () => {
    const html = `<a href="https://br.linkedin.com/company/clinica-salvi">x</a>`
    expect(extractFromHtml(html).linkedin).toBe("company/clinica-salvi")
  })

  it("distingue perfil pessoal de página de empresa", () => {
    const html = `<a href="https://www.linkedin.com/in/dra-tornelli">x</a>`
    // A personal profile is not reachable under /company/.
    expect(extractFromHtml(html).linkedin).toBe("in/dra-tornelli")
  })
})
