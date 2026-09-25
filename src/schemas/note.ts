import { z } from "zod"

export const noteCreateSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Escreva a anotação")
    .max(2000, "A anotação deve ter no máximo 2000 caracteres"),
})

export const noteUpdateSchema = noteCreateSchema

export type NoteCreateInput = z.infer<typeof noteCreateSchema>
