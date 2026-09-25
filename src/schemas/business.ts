import { z } from "zod"

import { BUSINESS_STATUS } from "@/domain/business"

/** Tri-state filter: any / with / without. */
export const presenceSchema = z.enum(["any", "yes", "no"])
export type Presence = z.infer<typeof presenceSchema>

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value))

export const businessFiltersSchema = z.object({
  search: optionalString,
  category: optionalString,
  city: optionalString,
  state: optionalString,
  minRating: z.coerce.number().min(0).max(5).optional(),
  minReviews: z.coerce.number().int().min(0).optional(),
  website: presenceSchema.default("any"),
  phone: presenceSchema.default("any"),
  instagram: presenceSchema.default("any"),
  status: z.enum(BUSINESS_STATUS).optional(),
  /**
   * Hides businesses the source reports as shut down. On by default, since a
   * closed business is never a usable lead.
   */
  hideClosed: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  collectedFrom: optionalString,
  collectedTo: optionalString,
  sortBy: z
    .enum(["name", "rating", "reviewsCount", "collectedAt", "city"])
    .default("collectedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
})

export type BusinessFilters = z.infer<typeof businessFiltersSchema>
export type BusinessFiltersInput = z.input<typeof businessFiltersSchema>

/** Editable subset of a business, used by the edit form and PATCH route. */
export const businessUpdateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da empresa"),
  category: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  website: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || /^https?:\/\/.+/.test(value),
      "Informe uma URL válida iniciando com http:// ou https://"
    ),
  rating: z.coerce.number().min(0).max(5).optional(),
  reviewsCount: z.coerce.number().int().min(0).optional(),
  status: z.enum(BUSINESS_STATUS).optional(),
  address: z
    .object({
      street: z.string().trim().optional(),
      number: z.string().trim().optional(),
      neighborhood: z.string().trim().optional(),
      city: z.string().trim().optional(),
      state: z.string().trim().optional(),
      postalCode: z.string().trim().optional(),
    })
    .optional(),
  instagram: z.string().trim().optional(),
})

/** Output (post-coercion) shape, used for API payloads. */
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>
/** Input shape accepted by the form fields before coercion. */
export type BusinessUpdateFormInput = z.input<typeof businessUpdateSchema>

export const businessIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Selecione ao menos uma empresa"),
})
