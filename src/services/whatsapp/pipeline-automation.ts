import { PIPELINE_STAGE_LABELS, type PipelineStage } from "@/domain/pipeline"
import { businessRepository } from "@/repositories/business.repository"
import { noteRepository } from "@/repositories/note.repository"
import { pipelineRepository } from "@/repositories/pipeline.repository"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"

/**
 * Moves leads forward on the board from what happens on WhatsApp:
 * sending the first message means "Contatado", getting an answer means
 * "Respondeu". It only ever moves forward from the early stages — a lead in
 * a meeting, proposal, won or lost is the user's call and is never touched.
 */

/** Stages each automatic move may start from. */
const MOVABLE_FROM: Record<"CONTACTED" | "REPLIED", (PipelineStage | null)[]> =
  {
    CONTACTED: [null, "NEW"],
    REPLIED: [null, "NEW", "CONTACTED"],
  }

export type StageChange = {
  businessId: string
  from: PipelineStage | null
  to: PipelineStage
}

async function businessIdsOf(conversationIds: string[]): Promise<string[]> {
  const ids = new Set<string>()
  for (const conversationId of new Set(conversationIds)) {
    const conversation =
      await whatsappConversationRepository.findById(conversationId)
    if (conversation?.businessId) ids.add(conversation.businessId)
  }
  return [...ids]
}

async function advance(
  businessId: string,
  to: "CONTACTED" | "REPLIED"
): Promise<StageChange | null> {
  const business = await businessRepository.findById(businessId)
  if (!business) return null

  const from = business.pipeline?.stage ?? null
  if (!MOVABLE_FROM[to].includes(from)) return null

  if (from === null) await pipelineRepository.add([businessId], to)
  else await pipelineRepository.move(businessId, to)

  // Written after the move, so the note carries the new stage.
  await noteRepository.create(
    businessId,
    `Etapa atualizada automaticamente para "${PIPELINE_STAGE_LABELS[to]}" pelo WhatsApp.`
  )
  return { businessId, from, to }
}

export async function advanceLeadStages({
  contactedConversationIds,
  repliedConversationIds,
}: {
  contactedConversationIds: string[]
  repliedConversationIds: string[]
}): Promise<StageChange[]> {
  const changes: StageChange[] = []

  // Replies first: a lead that answered skips straight past "Contatado".
  for (const businessId of await businessIdsOf(repliedConversationIds)) {
    const change = await advance(businessId, "REPLIED")
    if (change) changes.push(change)
  }
  for (const businessId of await businessIdsOf(contactedConversationIds)) {
    const change = await advance(businessId, "CONTACTED")
    if (change) changes.push(change)
  }

  return changes
}
