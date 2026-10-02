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

/** Opens a conversation with a lead, or with any number typed by hand. */
export const startConversationSchema = z.union([
  z.object({
    businessId: z
      .string()
      .refine((value) => Types.ObjectId.isValid(value), "Lead inválido"),
  }),
  z.object({
    phone: z
      .string()
      .trim()
      .min(8, "Informe o número com DDD")
      .max(30, "Número inválido"),
    /** Saved as the contact's name when the number is new to the CRM. */
    name: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => value || undefined),
  }),
])

export const messageListSchema = z.object({
  /** Id of the oldest message already loaded. */
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

/** Id of a stored message, to send as a reply to it. */
export const replyToSchema = z
  .string()
  .refine((value) => Types.ObjectId.isValid(value), "Mensagem inválida")
  .optional()

export const sendMessageSchema = z.object({
  replyTo: replyToSchema,
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

export const suggestReplySchema = z.object({
  /** What the user already typed; the suggestion keeps its intent. */
  draft: z.string().max(4096).optional(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
