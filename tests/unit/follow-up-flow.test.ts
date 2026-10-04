import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { PipelineStage } from "@/domain/pipeline"
import type { WaMessage } from "@/lib/whatsapp/client"

import { startTestDatabase } from "../helpers/db"
import { FakeWhatsAppClient } from "../helpers/fake-whatsapp"

/** What Claude says when asked whether a reply was automatic. */
let claudeSaysAutomated = false
const FOLLOW_UP_TEXT = "Passando aqui de novo — faz sentido a gente conversar?"

const runClaude = vi.fn(
  async (_prompt: string, options: { schema: { required: string[] } }) =>
    options.schema.required.includes("automated")
      ? { automated: claudeSaysAutomated }
      : { message: FOLLOW_UP_TEXT }
)

vi.mock("@/lib/claude-cli", () => ({
  ClaudeCliError: class extends Error {},
  runClaude: (prompt: string, options: { schema: { required: string[] } }) =>
    runClaude(prompt, options),
}))

const { BusinessModel } = await import("@/models/business.model")
const { CampaignItemModel } = await import("@/models/campaign-item.model")
const { FollowUpModel } = await import("@/models/follow-up.model")
const { NoteModel } = await import("@/models/note.model")
const { SettingsModel } = await import("@/models/settings.model")
const { WhatsAppContactModel } = await import("@/models/whatsapp-contact.model")
const { WhatsAppConversationModel } =
  await import("@/models/whatsapp-conversation.model")
const { WhatsAppMessageModel } = await import("@/models/whatsapp-message.model")
const { WhatsAppSessionModel } = await import("@/models/whatsapp-session.model")
const { followUpRepository } =
  await import("@/repositories/follow-up.repository")
const { autoReplyClassifier } = await import("@/services/follow-up/auto-reply")
const { followUpService } =
  await import("@/services/follow-up/follow-up.service")
const { followUpGenerator } = await import("@/services/follow-up/generator")
const { followUpTick, resetFollowUpPace, setFollowUpSenderRandom } =
  await import("@/services/follow-up/sender")
const { WROTE_AGAIN_REASON, LEFT_CONTACTED_REASON } =
  await import("@/services/follow-up/watch")
const { ingestBatch } = await import("@/services/whatsapp/ingest.service")
const {
  configureWhatsAppRuntime,
  resetWhatsAppRuntime,
  whatsappSessionService,
} = await import("@/services/whatsapp/session.service")

const DAY = 24 * 60 * 60 * 1000
// São Paulo is UTC-3. 2026-10-08 is a Thursday, inside the default window.
const THURSDAY_10H = new Date("2026-10-08T10:00:00-03:00")
const DIGITS = "5511999990000"
const JID = `${DIGITS}@s.whatsapp.net`

let database: Awaited<ReturnType<typeof startTestDatabase>>
let sessionDir: string
let client: FakeWhatsAppClient
let counter = 0

async function until(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 4000
): Promise<void> {
  const started = Date.now()
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error("timeout")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function message(fromMe: boolean, body: string, timestamp: Date): WaMessage {
  counter += 1
  return {
    id: `msg-${counter}`,
    chatJid: JID,
    fromMe,
    from: fromMe ? "5511000000000@s.whatsapp.net" : JID,
    to: fromMe ? JID : "me",
    body,
    type: "text",
    timestamp,
    status: fromMe ? "SENT" : "RECEIVED",
  }
}

/** Stores old messages without moving anyone on the board. */
async function history(...messages: WaMessage[]) {
  await ingestBatch({ chats: [], contacts: [], messages }, "history")
}

/** Delivers fresh messages as WhatsApp would, automation included. */
async function live(...messages: WaMessage[]) {
  client.on.onBatch({ chats: [], contacts: [], messages }, "live")
  await until(
    async () =>
      (await WhatsAppMessageModel.countDocuments({
        whatsappMessageId: { $in: messages.map((item) => item.id) },
      })) === messages.length
  )
  // Pipeline automation runs right after the messages are stored.
  await new Promise((resolve) => setTimeout(resolve, 50))
}

async function seedLead(
  stage: PipelineStage | null = "CONTACTED"
): Promise<string> {
  const doc = await BusinessModel.create({
    name: "Padaria Pão Quente",
    phone: `+${DIGITS}`,
    source: "manual",
    externalId: `fu-${(counter += 1)}`,
    ...(stage
      ? { pipeline: { stage, position: 0, enteredAt: new Date() } }
      : {}),
  })
  return String(doc._id)
}

async function stageOf(businessId: string) {
  const business = await BusinessModel.findById(businessId).lean<{
    pipeline?: { stage?: string }
  }>()
  return business?.pipeline?.stage ?? null
}

async function followUpOf(businessId: string) {
  const [followUp] = await followUpRepository.listByBusinesses([businessId])
  return followUp ?? null
}

async function waitForGeneration() {
  await until(() => !followUpGenerator.isRunning())
}

/** A lead in "Contatado" whose first message went out 4 days ago. */
async function contactedLead(...replies: { body: string; after: number }[]) {
  const businessId = await seedLead()
  const sentAt = new Date(Date.now() - 4 * DAY)
  await history(
    message(
      true,
      "Oi, vi que vocês não têm site. Posso mostrar uma ideia?",
      sentAt
    ),
    ...replies.map((reply) =>
      message(
        false,
        reply.body,
        new Date(sentAt.getTime() + reply.after * 1000)
      )
    )
  )
  return businessId
}

/** Creates, writes and approves the lead's follow-up. */
async function approvedFollowUp(businessId: string) {
  await followUpService.maintain(new Date())
  await waitForGeneration()
  const followUp = await followUpOf(businessId)
  expect(followUp?.status).toBe("READY")
  await followUpService.update(followUp!.id, { status: "APPROVED" })
  return followUp!
}

async function connectWhatsApp() {
  resetWhatsAppRuntime()
  client = new FakeWhatsAppClient()
  configureWhatsAppRuntime({
    factory: () => client,
    settleMs: 10,
    maxSyncMs: 1000,
    reconnectDelayMs: 5,
  })
  await whatsappSessionService.connect()
  client.on.onOpen({ phone: "5511000000000" })
  client.on.onCaughtUp()
  await until(
    async () => (await whatsappSessionService.snapshot()).status === "READY"
  )
  client.registered.set(DIGITS, JID)
}

beforeAll(async () => {
  sessionDir = await mkdtemp(join(tmpdir(), "wa-follow-up-"))
  process.env.WHATSAPP_SESSION_DIR = sessionDir
  process.env.WHATSAPP_SESSION_NAME = "follow-up-test"
  process.env.WHATSAPP_CAMPAIGN_DAILY_LIMIT = "1"
  database = await startTestDatabase("follow-ups")
  await Promise.all([
    FollowUpModel.init(),
    WhatsAppMessageModel.init(),
    WhatsAppConversationModel.init(),
  ])
  setFollowUpSenderRandom(() => 0.5)
}, 120_000)

afterAll(async () => {
  resetWhatsAppRuntime()
  await database.stop()
  await rm(sessionDir, { recursive: true, force: true })
})

beforeEach(async () => {
  runClaude.mockClear()
  claudeSaysAutomated = false
  resetFollowUpPace()
  await connectWhatsApp()
})

afterEach(async () => {
  await until(
    () => !followUpGenerator.isRunning() && !autoReplyClassifier.isRunning()
  )
  resetWhatsAppRuntime()
  await Promise.all(
    [
      BusinessModel,
      CampaignItemModel,
      FollowUpModel,
      NoteModel,
      SettingsModel,
      WhatsAppContactModel,
      WhatsAppConversationModel,
      WhatsAppMessageModel,
      WhatsAppSessionModel,
    ].map((model) => (model as typeof BusinessModel).deleteMany({}))
  )
})

describe("entrada na fila", () => {
  it("lead em Contatado sem resposta há 3 dias ganha follow-up escrito pela IA, sem travessão", async () => {
    const businessId = await contactedLead()

    expect(await followUpService.maintain(new Date())).toBe(1)
    await waitForGeneration()

    const followUp = await followUpOf(businessId)
    expect(followUp?.status).toBe("READY")
    expect(followUp?.message).toBe(
      "Passando aqui de novo, faz sentido a gente conversar?"
    )
    const [prompt] = runClaude.mock.calls[0] as unknown as [string]
    expect(prompt).toContain("Padaria Pão Quente")
    expect(prompt).toContain("Posso mostrar uma ideia?")
  })

  it("antes de 3 dias, ou fora de Contatado, não entra", async () => {
    const recent = await seedLead()
    await history(message(true, "Oi", new Date(Date.now() - 2 * DAY)))
    expect(await followUpService.maintain(new Date())).toBe(0)
    expect(await followUpOf(recent)).toBeNull()

    await BusinessModel.updateOne(
      { _id: recent },
      { "pipeline.stage": "MEETING" }
    )
    expect(
      await followUpService.maintain(new Date(Date.now() + 10 * DAY))
    ).toBe(0)
  })

  it("um lead recebe um único follow-up", async () => {
    const businessId = await contactedLead()
    await followUpService.maintain(new Date())
    await waitForGeneration()
    await followUpService.maintain(new Date())
    expect(await FollowUpModel.countDocuments({ businessId })).toBe(1)
  })
})

describe("respostas automáticas", () => {
  it("saudação automática não conta como resposta: o lead ainda recebe follow-up", async () => {
    const businessId = await contactedLead({
      body: "Olá! Obrigado por entrar em contato. Em breve retornaremos.",
      after: 4,
    })

    await followUpService.maintain(new Date())
    await waitForGeneration()

    const followUp = await followUpOf(businessId)
    expect(followUp?.status).toBe("READY")
    expect(followUp?.autoReplies).toEqual([
      "Olá! Obrigado por entrar em contato. Em breve retornaremos.",
    ])
    const [prompt] = runClaude.mock.calls.at(-1) as unknown as [string]
    expect(prompt).toContain("(resposta automática)")
  })

  it("resposta automática ao vivo deixa o lead em Contatado", async () => {
    const businessId = await seedLead(null)
    await live(message(true, "Oi, tudo bem?", new Date(Date.now() - 10_000)))
    await until(async () => (await stageOf(businessId)) === "CONTACTED")

    await live(
      message(
        false,
        "Esta é uma mensagem automática. Nosso horário de atendimento é das 8h às 18h.",
        new Date()
      )
    )
    expect(await stageOf(businessId)).toBe("CONTACTED")
    const stored = await WhatsAppMessageModel.findOne({ fromMe: false }).lean<{
      autoReply?: { verdict: string; source: string }
    }>()
    expect(stored?.autoReply).toEqual({
      verdict: "automated",
      source: "heuristic",
    })
  })

  it("resposta duvidosa vai para o Claude: se for de gente, o lead vai para Respondeu", async () => {
    const businessId = await seedLead(null)
    await live(message(true, "Oi, tudo bem?", new Date(Date.now() - 60_000)))
    await until(async () => (await stageOf(businessId)) === "CONTACTED")

    claudeSaysAutomated = false
    await live(message(false, "Olá, como posso te ajudar?", new Date()))
    await until(async () => (await stageOf(businessId)) === "REPLIED")
    expect(runClaude).toHaveBeenCalledTimes(1)
  })

  it("resposta duvidosa que o Claude diz ser automática mantém Contatado", async () => {
    const businessId = await seedLead(null)
    await live(message(true, "Oi, tudo bem?", new Date(Date.now() - 60_000)))
    await until(async () => (await stageOf(businessId)) === "CONTACTED")

    claudeSaysAutomated = true
    await live(message(false, "Olá, como posso te ajudar?", new Date()))
    await until(async () => {
      const stored = await WhatsAppMessageModel.findOne({
        fromMe: false,
      }).lean<{ autoReply?: { verdict: string } }>()
      return stored?.autoReply?.verdict === "automated"
    })
    expect(await stageOf(businessId)).toBe("CONTACTED")
  })
})

describe("envio", () => {
  it("aprovado, sai no horário da janela mesmo com a cota diária esgotada", async () => {
    const businessId = await contactedLead()
    // The daily limit (1) is already used by a campaign today.
    await CampaignItemModel.collection.insertOne({
      campaignId: new BusinessModel()._id,
      businessId: new BusinessModel()._id,
      businessName: "Outro",
      status: "SENT",
      sentAt: new Date(),
      position: 0,
    })

    await approvedFollowUp(businessId)
    await followUpTick(THURSDAY_10H)

    const followUp = await followUpOf(businessId)
    expect(followUp?.status).toBe("SENT")
    expect(client.sent.map((item) => item.text)).toEqual([
      "Passando aqui de novo, faz sentido a gente conversar?",
    ])
    // Sending the follow-up does not move the lead.
    expect(await stageOf(businessId)).toBe("CONTACTED")
  })

  it("fora da janela espera; o segundo respeita o intervalo", async () => {
    const first = await contactedLead()
    const followUp = await approvedFollowUp(first)
    resetFollowUpPace()

    // Saturday: outside the default window.
    await followUpTick(new Date("2026-10-10T10:00:00-03:00"))
    expect((await followUpRepository.findById(followUp.id))?.status).toBe(
      "APPROVED"
    )

    await followUpTick(THURSDAY_10H)
    expect((await followUpRepository.findById(followUp.id))?.status).toBe(
      "SENT"
    )
  })

  it("resposta real antes do envio cancela o follow-up", async () => {
    const businessId = await contactedLead()
    await followUpService.maintain(new Date())
    await waitForGeneration()

    await live(message(false, "Não tenho interesse, obrigado", new Date()))
    await until(
      async () => (await followUpOf(businessId))?.status === "REPLIED"
    )
    expect(await stageOf(businessId)).toBe("REPLIED")
  })

  it("mensagem manual cancela o follow-up pendente", async () => {
    const businessId = await contactedLead()
    const followUp = await approvedFollowUp(businessId)
    const conversationId = followUp.conversationId

    await whatsappSessionService.sendText(conversationId, "Oi de novo!")
    const after = await followUpRepository.findById(followUp.id)
    expect(after?.status).toBe("CANCELLED")
    expect(after?.reason).toBe(WROTE_AGAIN_REASON)

    await followUpTick(THURSDAY_10H)
    expect(client.sent.map((item) => item.text)).toEqual(["Oi de novo!"])
  })

  it("lead movido no funil antes do envio cancela o follow-up", async () => {
    const businessId = await contactedLead()
    const followUp = await approvedFollowUp(businessId)

    await BusinessModel.updateOne(
      { _id: businessId },
      { "pipeline.stage": "MEETING" }
    )
    await followUpService.onLeadsMoved([businessId])

    const after = await followUpRepository.findById(followUp.id)
    expect(after?.status).toBe("CANCELLED")
    expect(after?.reason).toBe(LEFT_CONTACTED_REASON)
  })
})

describe("depois do envio", () => {
  async function sentFollowUp() {
    const businessId = await contactedLead()
    const followUp = await approvedFollowUp(businessId)
    await followUpTick(THURSDAY_10H)
    const sent = await followUpRepository.findById(followUp.id)
    expect(sent?.status).toBe("SENT")
    return { businessId, followUp: sent! }
  }

  it("sem resposta em 3 dias: oferece Perdido; mover leva o lead para Perdido com nota", async () => {
    const { businessId, followUp } = await sentFollowUp()
    const sentAt = followUp.sentAt!

    await followUpService.maintain(new Date(sentAt.getTime() + 2 * DAY))
    expect((await followUpRepository.findById(followUp.id))?.status).toBe(
      "SENT"
    )

    await followUpService.maintain(new Date(sentAt.getTime() + 3 * DAY + 1))
    expect((await followUpRepository.findById(followUp.id))?.status).toBe(
      "NO_REPLY"
    )
    // Nothing moves on its own.
    expect(await stageOf(businessId)).toBe("CONTACTED")

    expect(await followUpService.markLost([followUp.id])).toBe(1)
    expect(await stageOf(businessId)).toBe("LOST")
    expect((await followUpRepository.findById(followUp.id))?.status).toBe(
      "LOST"
    )
    const notes = await NoteModel.find({ businessId }).lean<
      { body?: string; content?: string; text?: string }[]
    >()
    expect(JSON.stringify(notes)).toContain("não respondeu ao follow-up")
  })

  it("manter em Contatado tira da lista sem mover o lead", async () => {
    const { businessId, followUp } = await sentFollowUp()
    await followUpService.maintain(
      new Date(followUp.sentAt!.getTime() + 4 * DAY)
    )
    await followUpService.keep(followUp.id)
    expect((await followUpRepository.findById(followUp.id))?.status).toBe(
      "CLOSED"
    )
    expect(await stageOf(businessId)).toBe("CONTACTED")
  })

  it("resposta depois do follow-up marca Respondeu", async () => {
    const { businessId, followUp } = await sentFollowUp()
    await live(
      message(
        false,
        "Opa, tenho interesse sim",
        new Date(followUp.sentAt!.getTime() + 60_000)
      )
    )
    await until(
      async () => (await followUpOf(businessId))?.status === "REPLIED"
    )
    expect(await stageOf(businessId)).toBe("REPLIED")
  })
})

describe("revisão de leads em Respondeu por resposta automática", () => {
  async function repliedOnGreeting() {
    const businessId = await seedLead("REPLIED")
    const sentAt = new Date(Date.now() - 4 * DAY)
    await history(
      message(true, "Oi, vi que vocês não têm site.", sentAt),
      message(
        false,
        "Olá! Obrigado por entrar em contato. Em breve retornaremos.",
        new Date(sentAt.getTime() + 3000)
      )
    )
    const [conversation] =
      await WhatsAppConversationModel.find().lean<{ _id: unknown }[]>()
    await autoReplyClassifier.classifyConversation(String(conversation._id))
    return businessId
  }

  it("aparece na revisão e nada muda sozinho", async () => {
    const businessId = await repliedOnGreeting()
    const review = await followUpService.autoReplyReview()
    expect(review.map((item) => item.businessId)).toEqual([businessId])
    expect(await stageOf(businessId)).toBe("REPLIED")
  })

  it("voltar para Contatado coloca o lead na fila do follow-up", async () => {
    const businessId = await repliedOnGreeting()
    await followUpService.resolveAutoReply(businessId, "contacted")
    expect(await stageOf(businessId)).toBe("CONTACTED")
    await waitForGeneration()
    expect((await followUpOf(businessId))?.status).toBe("READY")
    expect(await followUpService.autoReplyReview()).toEqual([])
  })

  it("é resposta real: sai da revisão e fica em Respondeu", async () => {
    const businessId = await repliedOnGreeting()
    await followUpService.resolveAutoReply(businessId, "human")
    expect(await followUpService.autoReplyReview()).toEqual([])
    expect(await stageOf(businessId)).toBe("REPLIED")
  })
})
