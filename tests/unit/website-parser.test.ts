import { describe, expect, it } from "vitest"

import { extractFromHtml } from "@crawler/parsers/website.parser"

const HTML = `
<!doctype html>
<html>
  <head><title>  Restaurante Silva &amp; Cia  </title></head>
  <body>
    <a href="mailto:contato@silva.com.br">Contato</a>
    <p>comercial@silva.com.br</p>
    <a href="https://www.instagram.com/restaurante.silva/">Instagram</a>
    <a href="https://wa.me/5511988887777">WhatsApp</a>
    <a href="https://www.linkedin.com/company/silva-cia">LinkedIn</a>
    <script src="/wp-content/themes/app.js"></script>
    <script src="https://www.googletagmanager.com/gtm.js"></script>
    <img src="logo@2x.png" />
  </body>
</html>
`

describe("extractFromHtml", () => {
  const result = extractFromHtml(HTML)

  it("decodes and trims the page title", () => {
    expect(result.title).toBe("Restaurante Silva & Cia")
  })

  it("collects unique e-mails and skips image assets", () => {
    expect(result.emails).toEqual([
      "contato@silva.com.br",
      "comercial@silva.com.br",
    ])
  })

  it("extracts social handles", () => {
    expect(result.instagram).toBe("restaurante.silva")
    expect(result.whatsapp).toBe("5511988887777")
    // Stored with its path segment so the profile link can be rebuilt.
    expect(result.linkedin).toBe("company/silva-cia")
  })

  it("detects technologies from page signals", () => {
    expect(result.technologies).toContain("WordPress")
    expect(result.technologies).toContain("Google Tag Manager")
  })

  it("returns empty values for a page with no contact data", () => {
    const empty = extractFromHtml("<html><body>nada</body></html>")
    expect(empty.emails).toEqual([])
    expect(empty.instagram).toBeUndefined()
    expect(empty.technologies).toEqual([])
  })
})
