import { z } from "zod"

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .optional()
    .transform((value) => (value === "" ? undefined : value))

export const sellerProfileSchema = z.object({
  sellerName: optionalText(120),
  offer: optionalText(4000),
  instructions: optionalText(2000),
})

export type SellerProfileInput = z.infer<typeof sellerProfileSchema>
export type SellerProfileFormInput = z.input<typeof sellerProfileSchema>
