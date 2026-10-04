import { Types } from "mongoose"
import { z } from "zod"

const objectId = z
  .string()
  .refine((value) => Types.ObjectId.isValid(value), "Identificador inválido")

export const followUpUpdateSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "A mensagem não pode ficar vazia")
    .max(4096)
    .optional(),
  status: z.enum(["APPROVED", "SKIPPED"]).optional(),
})

export const followUpLostSchema = z.object({
  ids: z.array(objectId).min(1).max(500),
})

export const autoReplyResolveSchema = z.object({
  businessId: objectId,
  action: z.enum(["contacted", "human"]),
})
