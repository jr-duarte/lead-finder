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
} from "vitest"

import { startTestDatabase } from "../helpers/db"
import { FakeWhatsAppClient } from "../helpers/fake-whatsapp"

import type { WaBatch, WaMessage } from "@/lib/whatsapp/client"
import { BusinessModel } from "@/models/business.model"
import { NoteModel } from "@/models/note.model"
import { WhatsAppContactModel } from "@/models/whatsapp-contact.model"
import { WhatsAppConversationModel } from "@/models/whatsapp-conversation.model"
import { WhatsAppMessageModel } from "@/models/whatsapp-message.model"
import { WhatsAppSessionModel } from "@/models/whatsapp-session.model"
import { onWhatsAppEvent, type WhatsAppEvent } from "@/services/whatsapp/events"
import {
  configureWhatsAppRuntime,
  resetWhatsAppRuntime,
  WhatsAppActionError,
  whatsappSessionService,
} from "@/services/whatsapp/session.service"

const JOAO = "5511999998888@s.whatsapp.net"

function incoming(id: string, body: string, at: string): WaMessage {
  return {
    id,
    chatJid: JOAO,
    fromMe: false,
    from: JOAO,
    to: "me",
    body,
    type: "text",
    timestamp: new Date(at),
    status: "RECEIVED",
    pushName: "João",
  }
}

function batch(messages: WaMessage[]): WaBatch {
  return { chats: [], contacts: [], messages }
}

async function until(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 3000
): Promise<void> {
  const started = Date.now()
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("condition not met in time")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const status = async () => (await whatsappSessionService.snapshot()).status

let database: Awaited<ReturnType<typeof startTestDatabase>>
let sessionDir: string
let client: FakeWhatsAppClient

/** Simulates opening the CRM: fresh process state, same database. */
function bootCrm() {
  resetWhatsAppRuntime()
  client = new FakeWhatsAppClient()
  configureWhatsAppRuntime({
    factory: () => client,
    settleMs: 20,
    maxSyncMs: 2000,
    reconnectDelayMs: 5,
  })
}

async function connectAndSync(messages: WaMessage[]) {
  await whatsappSessionService.connect()
  client.on.onOpen({ phone: "5511000000000", pushName: "Eu" })
  if (messages.length) client.on.onBatch(batch(messages), "offline")
  client.on.onCaughtUp()
  await until(async () => (await status()) === "READY")
}

beforeAll(async () => {
  sessionDir = await mkdtemp(join(tmpdir(), "wa-session-"))
  process.env.WHATSAPP_SESSION_DIR = sessionDir
  process.env.WHATSAPP_SESSION_NAME = "test"
  database = await startTestDatabase("whatsapp-session")
  await WhatsAppMessageModel.init()
  await WhatsAppConversationModel.init()
}, 120_000)

afterAll(async () => {
  resetWhatsAppRuntime()
  await database.stop()
  await rm(sessionDir, { recursive: true, force: true })
})

beforeEach(() => {
  bootCrm()
})

afterEach(async () => {
  resetWhatsAppRuntime()
  await Promise.all([
    BusinessModel.deleteMany({}),
    NoteModel.deleteMany({}),
    WhatsAppSessionModel.deleteMany({}),
    WhatsAppContactModel.deleteMany({}),
    WhatsAppConversationModel.deleteMany({}),
    WhatsAppMessageModel.deleteMany({}),
  ])
})

describe("conexão", () => {
  it("mostra o QR Code e não cria uma segunda instância", async () => {
    await whatsappSessionService.connect()
    await whatsappSessionService.connect()
    expect(client.starts).toBe(1)
    expect(await status()).toBe("INITIALIZING")

    client.on.onQr("2@fake-qr-payload")
    await until(async () => (await status()) === "QR_REQUIRED")

    const snapshot = await whatsappSessionService.snapshot()
    expect(snapshot.qr).toMatch(/^data:image\/png;base64,/)
  })

  it("QR Code expirado volta para desconectado com uma mensagem clara", async () => {
    await whatsappSessionService.connect()
    client.on.onQr("2@fake")
    client.on.onClose({
      loggedOut: false,
      restartRequired: false,
      qrExpired: true,
      replaced: false,
    })
    const snapshot = await whatsappSessionService.snapshot()
    expect(snapshot.status).toBe("DISCONNECTED")
    expect(snapshot.error).toMatch(/QR Code expirou/)
  })

  it("reconecta sozinho quando a conexão cai", async () => {
    await connectAndSync([])
    client.on.onClose({
      loggedOut: false,
      restartRequired: false,
      qrExpired: false,
      replaced: false,
      message: "Connection Lost",
    })
    expect(await status()).toBe("RECONNECTING")
    await until(() => client.starts === 2)
  })

  it("logout pelo celular exige novo QR Code", async () => {
    await connectAndSync([])
    client.on.onClose({
      loggedOut: true,
      restartRequired: false,
      qrExpired: false,
      replaced: false,
    })
    expect(await status()).toBe("LOGGED_OUT")
  })

  it("desconectar desvincula o aparelho", async () => {
    await connectAndSync([])
    await whatsappSessionService.disconnect()
    expect(client.loggedOut).toBe(true)
    expect(await status()).toBe("DISCONNECTED")
  })
})

describe("sincronização ao iniciar", () => {
  it("recupera o que chegou com o CRM fechado e registra a sincronização", async () => {
    const events: WhatsAppEvent[] = []
    const off = onWhatsAppEvent((event) => events.push(event))

    await connectAndSync([
      incoming("m1", "Oi", "2026-10-01T09:30:00Z"),
      incoming("m2", "Você está aí?", "2026-10-01T10:00:00Z"),
    ])
    off()

    expect(await WhatsAppMessageModel.countDocuments()).toBe(2)
    const conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(conversation?.lastMessage).toBe("Você está aí?")
    expect(conversation?.unreadCount).toBe(2)

    const snapshot = await whatsappSessionService.snapshot()
    expect(snapshot.lastSyncAt).toBeInstanceOf(Date)
    expect(snapshot.lastSync?.newMessages).toBe(2)
    expect(snapshot.lastSync?.conversations).toBe(1)
    expect(snapshot.phoneNumber).toBe("5511000000000")

    const statuses = events.flatMap((event) =>
      event.type === "status" ? [event.status] : []
    )
    expect(statuses).toEqual(
      expect.arrayContaining(["INITIALIZING", "CONNECTED", "SYNCING", "READY"])
    )
    expect(events.some((event) => event.type === "conversations")).toBe(true)
  })

  it("reiniciar o CRM várias vezes não duplica mensagens", async () => {
    const first = [
      incoming("m1", "Oi", "2026-10-01T09:30:00Z"),
      incoming("m2", "Você está aí?", "2026-10-01T10:00:00Z"),
    ]
    await connectAndSync(first)
    const firstSyncAt = (await whatsappSessionService.snapshot()).lastSyncAt

    // Second boot: WhatsApp redelivers the old ones plus a new message.
    bootCrm()
    await connectAndSync([
      ...first,
      incoming("m3", "Alô?", "2026-10-01T12:00:00Z"),
    ])

    // Third boot: nothing new.
    bootCrm()
    await connectAndSync(first)

    expect(await WhatsAppMessageModel.countDocuments()).toBe(3)
    expect(await WhatsAppConversationModel.countDocuments()).toBe(1)
    const conversation = await WhatsAppConversationModel.findOne()
    expect(conversation?.unreadCount).toBe(3)

    const snapshot = await whatsappSessionService.snapshot()
    expect(snapshot.lastSync?.newMessages).toBe(0)
    expect(snapshot.lastSyncAt!.getTime()).toBeGreaterThan(
      firstSyncAt!.getTime()
    )
  })

  it("Sincronizar agora pode rodar várias vezes sem duplicar", async () => {
    await connectAndSync([incoming("m1", "Oi", "2026-10-01T09:30:00Z")])

    for (let run = 0; run < 3; run += 1) {
      await whatsappSessionService.sync()
      await until(async () => (await status()) === "READY")
    }

    expect(await WhatsAppMessageModel.countDocuments()).toBe(1)
    expect(await WhatsAppConversationModel.countDocuments()).toBe(1)
  })

  it("Sincronizar agora sem conexão inicia a conexão", async () => {
    await whatsappSessionService.sync()
    expect(client.starts).toBe(1)
  })

  it("falha no meio não avança a última sincronização", async () => {
    await connectAndSync([incoming("m1", "Oi", "2026-10-01T09:30:00Z")])
    const before = (await whatsappSessionService.snapshot()).lastSyncAt

    bootCrm()
    await whatsappSessionService.connect()
    client.on.onOpen({ phone: "5511000000000" })
    // A batch the database rejects: the timestamp cannot be cast to a date.
    client.on.onBatch(batch([incoming("bad", "x", "not-a-date")]), "offline")
    client.on.onCaughtUp()
    await until(async () => (await status()) === "READY")

    const snapshot = await whatsappSessionService.snapshot()
    expect(snapshot.lastSyncAt?.getTime()).toBe(before?.getTime())
    expect(snapshot.lastSyncError).toBeTruthy()

    // Running again succeeds and still stores each message once.
    client.on.onBatch(
      batch([incoming("m2", "De novo", "2026-10-01T10:30:00Z")]),
      "live"
    )
    await whatsappSessionService.sync()
    await until(async () => (await status()) === "READY")
    expect(await WhatsAppMessageModel.countDocuments()).toBe(2)
    expect((await whatsappSessionService.snapshot()).lastSyncError).toBeFalsy()
  })
})

describe("mensagens com o CRM aberto", () => {
  it("nova mensagem ao vivo é salva e avisa o frontend", async () => {
    await connectAndSync([])
    const events: WhatsAppEvent[] = []
    const off = onWhatsAppEvent((event) => events.push(event))

    client.on.onBatch(
      batch([incoming("live1", "Beleza", "2026-10-01T13:00:00Z")]),
      "live"
    )
    await until(async () => (await WhatsAppMessageModel.countDocuments()) === 1)
    await until(() => events.some((event) => event.type === "conversations"))
    off()

    const conversation = await WhatsAppConversationModel.findOne()
    expect(conversation?.unreadCount).toBe(1)
  })

  it("envia mensagem, salva uma vez e zera as não lidas", async () => {
    await connectAndSync([incoming("m1", "Oi", "2026-10-01T09:30:00Z")])
    const conversation = await WhatsAppConversationModel.findOne()

    const sent = await whatsappSessionService.sendText(
      String(conversation?._id),
      "Sim, vou te enviar"
    )
    expect(client.sent).toEqual([{ chatJid: JOAO, text: "Sim, vou te enviar" }])
    expect(sent).toMatchObject({ fromMe: true, body: "Sim, vou te enviar" })

    // WhatsApp echoes our own message back as an event.
    client.on.onBatch(
      batch([
        {
          ...incoming(
            sent.whatsappMessageId,
            "Sim, vou te enviar",
            sent.timestamp.toString()
          ),
          fromMe: true,
          timestamp: sent.timestamp,
        },
      ]),
      "live"
    )
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(await WhatsAppMessageModel.countDocuments()).toBe(2)
    const updated = await WhatsAppConversationModel.findById(conversation?._id)
    expect(updated?.lastMessage).toBe("Sim, vou te enviar")
    expect(updated?.lastMessageFromMe).toBe(true)
    expect(updated?.unreadCount).toBe(0)
  })

  it("atualiza o status de entrega só para frente", async () => {
    await connectAndSync([incoming("m1", "Oi", "2026-10-01T09:30:00Z")])
    const conversation = await WhatsAppConversationModel.findOne()
    const sent = await whatsappSessionService.sendText(
      String(conversation?._id),
      "Olá"
    )

    client.on.onMessageStatus([{ id: sent.whatsappMessageId, status: "READ" }])
    client.on.onMessageStatus([
      { id: sent.whatsappMessageId, status: "DELIVERED" },
    ])
    await until(async () => {
      const stored = await WhatsAppMessageModel.findOne({
        whatsappMessageId: sent.whatsappMessageId,
      })
      return stored?.status === "READ"
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    const stored = await WhatsAppMessageModel.findOne({
      whatsappMessageId: sent.whatsappMessageId,
    })
    expect(stored?.status).toBe("READ")
  })

  it("recusa enviar sem conexão", async () => {
    await connectAndSync([incoming("m1", "Oi", "2026-10-01T09:30:00Z")])
    const conversation = await WhatsAppConversationModel.findOne()
    await whatsappSessionService.disconnect()

    await expect(
      whatsappSessionService.sendText(String(conversation?._id), "Olá")
    ).rejects.toBeInstanceOf(WhatsAppActionError)
  })
})

let seed = 0
async function seedLead(fields: Record<string, unknown> = {}) {
  const doc = await BusinessModel.create({
    name: "Padaria XYZ",
    source: "manual",
    externalId: `lead-${(seed += 1)}`,
    phone: "(11) 99999-8888",
    ...fields,
  })
  return String(doc._id)
}

async function stageOf(businessId: string) {
  const business = await BusinessModel.findById(businessId).lean<{
    pipeline?: { stage?: string }
  }>()
  return business?.pipeline?.stage ?? null
}

describe("iniciar conversa com um lead", () => {
  it("verifica o número, cria a conversa e vincula ao lead", async () => {
    const businessId = await seedLead()
    await connectAndSync([])
    client.registered.set("5511999998888", JOAO)

    const conversation =
      await whatsappSessionService.startConversation(businessId)

    expect(conversation.whatsappChatId).toBe(JOAO)
    expect(conversation.businessId).toBe(businessId)
    expect(conversation.leadLinkSource).toBe("manual")
    expect(conversation.title).toBe("Padaria XYZ")
  })

  it("usa o jid que o WhatsApp devolve (conta sem o nono dígito)", async () => {
    const businessId = await seedLead()
    await connectAndSync([])
    client.registered.set("5511999998888", "551199998888@s.whatsapp.net")

    const conversation =
      await whatsappSessionService.startConversation(businessId)
    expect(conversation.whatsappChatId).toBe("551199998888@s.whatsapp.net")
  })

  it("tenta os outros telefones do lead", async () => {
    const businessId = await seedLead({
      registry: { phones: ["(21) 98888-7777"] },
    })
    await connectAndSync([])
    client.registered.set("5521988887777", "5521988887777@s.whatsapp.net")

    const conversation =
      await whatsappSessionService.startConversation(businessId)
    expect(conversation.whatsappChatId).toBe("5521988887777@s.whatsapp.net")
  })

  it("reaproveita a conversa que o lead já tem", async () => {
    const businessId = await seedLead()
    await connectAndSync([])
    client.registered.set("5511999998888", JOAO)

    const first = await whatsappSessionService.startConversation(businessId)
    const second = await whatsappSessionService.startConversation(businessId)
    expect(second.id).toBe(first.id)
    expect(await WhatsAppConversationModel.countDocuments()).toBe(1)
  })

  it("recusa número sem WhatsApp, lead sem telefone e CRM desconectado", async () => {
    const withoutWhatsApp = await seedLead()
    const withoutPhone = await seedLead({ phone: undefined })
    await connectAndSync([])

    await expect(
      whatsappSessionService.startConversation(withoutWhatsApp)
    ).rejects.toMatchObject({ status: 422, message: /não.*WhatsApp/i })
    await expect(
      whatsappSessionService.startConversation(withoutPhone)
    ).rejects.toMatchObject({ status: 422 })
    expect(await WhatsAppConversationModel.countDocuments()).toBe(0)

    await whatsappSessionService.disconnect()
    await expect(
      whatsappSessionService.startConversation(withoutWhatsApp)
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe("hot reload em desenvolvimento", () => {
  it("troca um cliente criado por código antigo, sem pedir QR Code", async () => {
    const businessId = await seedLead()
    await connectAndSync([])

    // What a hot reload leaves behind: a live client built by older code,
    // without the methods added since.
    const stale = client
    const staleWithoutCheck = stale as unknown as Record<string, unknown>
    delete staleWithoutCheck.checkNumber
    staleWithoutCheck.checkNumber = undefined
    const globalRuntime = (
      globalThis as unknown as {
        __leadFinderWhatsApp: { clientVersion?: number }
      }
    ).__leadFinderWhatsApp
    globalRuntime.clientVersion = 1

    const fresh = new FakeWhatsAppClient()
    fresh.registered.set("5511999998888", JOAO)
    configureWhatsAppRuntime({
      factory: () => fresh,
      settleMs: 20,
      maxSyncMs: 2000,
      reconnectDelayMs: 5,
    })

    const pending = whatsappSessionService.startConversation(businessId)
    await until(() => fresh.starts === 1)
    fresh.on.onOpen({ phone: "5511000000000" })

    const conversation = await pending
    expect(conversation.whatsappChatId).toBe(JOAO)
    expect(stale.starts).toBe(1)
  })
})

describe("funil automático", () => {
  async function openWithLead(fields: Record<string, unknown> = {}) {
    const businessId = await seedLead(fields)
    await connectAndSync([])
    client.registered.set("5511999998888", JOAO)
    const conversation =
      await whatsappSessionService.startConversation(businessId)
    return { businessId, conversationId: conversation.id }
  }

  it("primeira mensagem enviada coloca o lead em Contatado", async () => {
    const { businessId, conversationId } = await openWithLead()
    expect(await stageOf(businessId)).toBeNull()

    await whatsappSessionService.sendText(conversationId, "Olá!")

    expect(await stageOf(businessId)).toBe("CONTACTED")
    const notes = await NoteModel.find({ businessId })
    expect(notes).toHaveLength(1)
    expect(notes[0].content).toMatch(/Contatado/)
    expect(notes[0].stage).toBe("CONTACTED")
  })

  it("resposta do lead move para Respondeu e avisa o frontend", async () => {
    const { businessId, conversationId } = await openWithLead()
    await whatsappSessionService.sendText(conversationId, "Olá!")

    const events: WhatsAppEvent[] = []
    const off = onWhatsAppEvent((event) => events.push(event))
    client.on.onBatch(
      batch([incoming("r1", "Oi, tudo bem?", "2026-10-01T14:00:00Z")]),
      "live"
    )
    await until(async () => (await stageOf(businessId)) === "REPLIED")
    await until(() => events.some((event) => event.type === "leads"))
    off()
  })

  it("resposta recebida com o CRM fechado também conta", async () => {
    const { businessId } = await openWithLead({
      pipeline: { stage: "CONTACTED", position: 0, enteredAt: new Date() },
    })
    client.on.onBatch(
      batch([incoming("r1", "Oi", "2026-10-01T09:30:00Z")]),
      "offline"
    )
    await until(async () => (await stageOf(businessId)) === "REPLIED")
  })

  it("histórico antigo não mexe no funil", async () => {
    const { businessId } = await openWithLead()
    client.on.onBatch(
      batch([incoming("h1", "Mensagem antiga", new Date().toISOString())]),
      "history"
    )
    await until(
      async () =>
        (await WhatsAppMessageModel.countDocuments({
          whatsappMessageId: "h1",
        })) === 1
    )
    expect(await stageOf(businessId)).toBeNull()
  })

  it("nunca mexe em leads em reunião, proposta, ganhos ou perdidos", async () => {
    for (const stage of ["MEETING", "PROPOSAL", "WON", "LOST"]) {
      bootCrm()
      await BusinessModel.deleteMany({})
      await WhatsAppConversationModel.deleteMany({})
      const { businessId, conversationId } = await openWithLead({
        pipeline: { stage, position: 0, enteredAt: new Date() },
      })
      await whatsappSessionService.sendText(conversationId, "Olá!")
      client.on.onBatch(
        batch([incoming(`r-${stage}`, "Oi", new Date().toISOString())]),
        "live"
      )
      await until(
        async () =>
          (await WhatsAppMessageModel.countDocuments({
            whatsappMessageId: `r-${stage}`,
          })) === 1
      )
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(await stageOf(businessId)).toBe(stage)
    }
    expect(await NoteModel.countDocuments()).toBe(0)
  })

  it("conversa sem lead não cria lead nem nota", async () => {
    await connectAndSync([incoming("m1", "Oi", "2026-10-01T09:30:00Z")])
    expect(await BusinessModel.countDocuments()).toBe(0)
    expect(await NoteModel.countDocuments()).toBe(0)
  })
})
