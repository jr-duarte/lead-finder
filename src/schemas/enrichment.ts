import { z } from "zod"

export const enrichmentRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Selecione ao menos uma empresa"),
  /**
   * Renders pages in a headless browser before extracting. On by default:
   * client-rendered sites return an empty document to a plain fetch, and the
   * browser is only launched for pages detected as such.
   */
  renderJavaScript: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .default(true)
    .transform((value) => value === true || value === "true"),
})

export type EnrichmentRequest = z.infer<typeof enrichmentRequestSchema>

export const enrichmentBatchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  onlyPending: z.coerce.boolean().default(true),
  renderJavaScript: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .default(true)
    .transform((value) => value === true || value === "true"),
})
