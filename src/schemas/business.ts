import { z } from "zod"

import { BUSINESS_STATUS } from "@/domain/business"
import { isValidCnpj } from "@/domain/cnpj"
import { PIPELINE_STAGES } from "@/domain/pipeline"

/** Tri-state filter: any / with / without. */
export const presenceSchema = z.enum(["any", "yes", "no"])
export type Presence = z.infer<typeof presenceSchema>

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value))

/** Separates several categories in one query parameter. */
export const CATEGORY_SEPARATOR = "|"

/** Splits a multi-value parameter ("a|b") into its values. */
function multiValue(transform: (value: string) => string = (value) => value) {
  return optionalString.transform((value) => {
    const list = value
      ?.split(CATEGORY_SEPARATOR)
      .map((item) => transform(item.trim()))
      .filter(Boolean)
    return list?.length ? list : undefined
  })
}

export const businessFiltersSchema = z.object({
  search: optionalString,
  /** One or more categories, joined by CATEGORY_SEPARATOR. */
  category: multiValue(),
  /** ISO alpha-2 codes, joined by CATEGORY_SEPARATOR. */
  country: multiValue((value) => value.toUpperCase()),
  city: optionalString,
  state: optionalString,
  minRating: z.coerce.number().min(0).max(5).optional(),
  minReviews: z.coerce.number().int().min(0).optional(),
  website: presenceSchema.default("any"),
  phone: presenceSchema.default("any"),
  instagram: presenceSchema.default("any"),
  /** "yes": a mobile phone or a WhatsApp link from the site. */
  whatsapp: presenceSchema.default("any"),
  status: z.enum(BUSINESS_STATUS).optional(),
  /** "any" ignores the funnel; "in"/"out" filter by board membership. */
  pipeline: z.enum(["any", "in", "out"]).default("any"),
  /** Narrows to a single funnel stage; implies being on the board. */
  pipelineStage: z.enum(PIPELINE_STAGES).optional(),
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
  /** "HH:mm" in Brasília; narrows the first day of the range. */
  collectedFromTime: optionalString,
  /** "HH:mm" in Brasília, inclusive; narrows the last day of the range. */
  collectedToTime: optionalString,
  sortBy: z
    .enum(["name", "rating", "reviewsCount", "collectedAt", "city"])
    .default("collectedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
})

export type BusinessFilters = z.infer<typeof businessFiltersSchema>
export type BusinessFiltersInput = z.input<typeof businessFiltersSchema>

/** Masked or bare; empty clears it. */
const cnpjField = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || isValidCnpj(value), "Informe um CNPJ válido")

/** Editable subset of a business, used by the edit form and PATCH route. */
export const businessUpdateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da empresa"),
  cnpj: cnpjField,
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

/**
 * Manual lead entry. Only the name is required: a lead jotted down from a
 * phone call should not demand a full record.
 */
export const businessCreateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da empresa"),
  cnpj: cnpjField,
  category: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  website: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || /^https?:\/\/.+\..+/.test(value),
      "Informe uma URL válida iniciando com http:// ou https://"
    ),
  instagram: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
      "Informe um e-mail válido"
    ),
  rating: z.coerce.number().min(0).max(5).optional(),
  reviewsCount: z.coerce.number().int().min(0).optional(),
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
  /** Adds the new lead straight to the board. */
  addToPipeline: z.boolean().default(false),
})

export type BusinessCreateInput = z.infer<typeof businessCreateSchema>
export type BusinessCreateFormInput = z.input<typeof businessCreateSchema>
