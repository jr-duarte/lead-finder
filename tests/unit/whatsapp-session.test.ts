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

import type {
  WaBatch,
  WaClientHandlers,
  WaMessage,
  WhatsAppClient,
} from "@/lib/whatsapp/client"
import { WhatsAppContactModel } from "@/models/whatsapp-contact.model"
import { WhatsAppConversationModel } from "@/models/whatsapp-conversation.model"
import { WhatsAppMessageModel } from "@/models/whatsapp-message.model"
import { WhatsAppSessionModel } from "@/models/whatsapp-session.model"
import { onWhatsAppEvent, type WhatsAppEvent } from "@/services/whatsapp/events"
import {
  configureWhatsAppRuntime,
  resetWhatsAppRuntime,
  SendError,
  whatsappSessionService,
} from "@/services/whatsapp/session.service"

const JOAO = "5511999998888@s.whatsapp.net"

/** Stands in for Baileys: tests drive the events by hand. */
class FakeWhatsAppClient implements WhatsAppClient {
  handlers: WaClientHandlers | null = null
  starts = 0
  sent: { chatJid: string; text: string }[] = []
  loggedOut = false
  private counter = 0

  async start(handlers: WaClientHandlers) {
    this.handlers = handlers
    this.starts += 1
  }

  async sendText(chatJid: string, text: string): Promise<WaMessage> {
    this.sent.push({ chatJid, text })
    return {
      id: `sent-${(this.counter += 1)}`,
      chatJid,
      fromMe: true,
      from: "5511000000000@s.whatsapp.net",
      to: chatJid,
      body: text,
      type: "text",
      timestamp: new Date(),
      status: "SENT",
    }
  }

  async logout() {
    this.loggedOut = true
  }

  async stop() {}

  get on(): WaClientHandlers {
    if (!this.handlers) throw new Error("client not started")
    return this.handlers
  }
}

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
    ).rejects.toBeInstanceOf(SendError)
  })
})
