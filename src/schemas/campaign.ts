import { Types } from "mongoose"
import { z } from "zod"

import { isValidTimeZone } from "@/domain/campaign"

const objectId = z
  .string()
  .refine((value) => Types.ObjectId.isValid(value), "Identificador inválido")

export const sendWindowSchema = z.object({
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Escolha ao menos um dia"),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
})

const timeZone = z.string().refine(isValidTimeZone, "Fuso horário desconhecido")

const intervalMinutes = z.coerce
  .number()
  .int()
  .min(2, "O intervalo mínimo é de 2 minutos")
  .max(24 * 60, "O intervalo máximo é de 24 horas")

const brief = z
  .string()
  .trim()
  .max(2000, "O ângulo da campanha pode ter até 2000 caracteres")

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à campanha").max(120),
  brief: brief.optional(),
  businessIds: z.array(objectId).max(500),
  intervalMinutes: intervalMinutes.optional(),
  window: sendWindowSchema.optional(),
  timeZone: timeZone.optional(),
  startAt: z.coerce.date().optional(),
})

export const campaignUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  /** Empty clears it. */
  brief: brief.optional(),
  intervalMinutes: intervalMinutes.optional(),
  window: sendWindowSchema.optional(),
  timeZone: timeZone.optional(),
  startAt: z.coerce.date().nullable().optional(),
})

export const campaignLeadsSchema = z.object({
  businessIds: z.array(objectId).min(1).max(500),
})

export const campaignItemUpdateSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "A mensagem não pode ficar vazia")
    .max(4096)
    .optional(),
  status: z.enum(["APPROVED", "SKIPPED"]).optional(),
})

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>
