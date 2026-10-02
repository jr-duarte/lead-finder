import { Types } from "mongoose"
import { z } from "zod"

export const conversationListSchema = z.object({
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  /** Only conversations linked to this lead. */
  businessId: z
    .string()
    .refine((value) => Types.ObjectId.isValid(value), "Lead inválido")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
})

export const startConversationSchema = z.object({
  businessId: z
    .string()
    .refine((value) => Types.ObjectId.isValid(value), "Lead inválido"),
})

export const messageListSchema = z.object({
  /** Id of the oldest message already loaded. */
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

export const sendMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Escreva a mensagem")
    .max(4096, "A mensagem deve ter no máximo 4096 caracteres"),
})

export const linkLeadSchema = z.object({
  businessId: z
    .string()
    .refine((value) => Types.ObjectId.isValid(value), "Lead inválido")
    .nullable(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
