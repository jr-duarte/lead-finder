import { describe, expect, it } from "vitest"

import {
  enrichmentBatchSchema,
  enrichmentRequestSchema,
} from "@/schemas/enrichment"

describe("enrichmentRequestSchema", () => {
  const ids = ["6ab6e533135ff9338a43e981"]

  it("aceita booleano, como enviado em JSON pelo cliente", () => {
    expect(
      enrichmentRequestSchema.parse({ ids, renderJavaScript: true })
        .renderJavaScript
    ).toBe(true)
    expect(
      enrichmentRequestSchema.parse({ ids, renderJavaScript: false })
        .renderJavaScript
    ).toBe(false)
  })

  it("aceita string, como vem de querystring", () => {
    expect(
      enrichmentRequestSchema.parse({ ids, renderJavaScript: "true" })
        .renderJavaScript
    ).toBe(true)
    expect(
      enrichmentRequestSchema.parse({ ids, renderJavaScript: "false" })
        .renderJavaScript
    ).toBe(false)
  })

  it("renderiza por padrão quando o campo é omitido", () => {
    expect(enrichmentRequestSchema.parse({ ids }).renderJavaScript).toBe(true)
  })
})

describe("enrichmentBatchSchema", () => {
  it("aceita as duas formas e mantém o padrão ligado", () => {
    expect(
      enrichmentBatchSchema.parse({ limit: 10, renderJavaScript: true })
        .renderJavaScript
    ).toBe(true)
    expect(
      enrichmentBatchSchema.parse({ limit: 10, renderJavaScript: "false" })
        .renderJavaScript
    ).toBe(false)
    expect(enrichmentBatchSchema.parse({ limit: 10 }).renderJavaScript).toBe(
      true
    )
  })
})
