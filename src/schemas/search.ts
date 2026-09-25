import { z } from "zod"

/**
 * Empty coordinate inputs arrive as "" from the form; they become undefined so
 * the source can decide whether it needs them.
 */
const optionalCoordinate = (min: number, max: number, message: string) =>
  z
    .union([
      z.literal(""),
      z.coerce.number().min(min, message).max(max, message),
    ])
    .optional()
    .transform((value) =>
      value === "" || value === undefined ? undefined : value
    )

export const searchFormSchema = z
  .object({
    category: z
      .string()
      .trim()
      .min(2, "Informe uma categoria com ao menos 2 caracteres"),
    location: z.string().trim().min(2, "Informe a localização"),
    latitude: optionalCoordinate(-90, 90, "Latitude deve estar entre -90 e 90"),
    longitude: optionalCoordinate(
      -180,
      180,
      "Longitude deve estar entre -180 e 180"
    ),
    radiusMeters: z.coerce
      .number()
      .int()
      .min(100, "O raio mínimo é de 100 metros")
      .max(50000, "O raio máximo é de 50.000 metros"),
    limit: z.coerce
      .number()
      .int()
      .min(1, "Colete ao menos 1 estabelecimento")
      .max(500, "Limite máximo de 500 por busca"),
  })
  // Coordinates work as a pair: one without the other cannot define a point.
  .refine(
    (data) => (data.latitude === undefined) === (data.longitude === undefined),
    {
      message: "Informe latitude e longitude juntas, ou deixe ambas em branco",
      path: ["latitude"],
    }
  )

export type SearchFormData = z.infer<typeof searchFormSchema>
export type SearchFormInput = z.input<typeof searchFormSchema>

export const searchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
