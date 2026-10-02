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

import { quotePreview } from "@/domain/whatsapp"
import { normalizeMessage } from "@/lib/whatsapp/baileys-normalize"
import { configureMediaStorage } from "@/lib/storage/media-storage"
import type { WaMessage } from "@/lib/whatsapp/client"
import { WhatsAppContactModel } from "@/models/whatsapp-contact.model"
import { WhatsAppConversationModel } from "@/models/whatsapp-conversation.model"
import { WhatsAppMessageModel } from "@/models/whatsapp-message.model"
import { WhatsAppSessionModel } from "@/models/whatsapp-session.model"
import { whatsappConversationService } from "@/services/whatsapp/conversation.service"
import {
  configureWhatsAppRuntime,
  resetWhatsAppRuntime,
  WhatsAppActionError,
  whatsappSessionService,
} from "@/services/whatsapp/session.service"

const JOAO = "5511999998888@s.whatsapp.net"
const MARIA = "5521988887777@s.whatsapp.net"
const ME = "5511000000000@s.whatsapp.net"

function incoming(
  id: string,
  body: string,
  extra: Partial<WaMessage> = {}
): WaMessage {
  return {
    id,
    chatJid: JOAO,
    fromMe: false,
    from: JOAO,
    to: "me",
    body,
    type: "text",
    timestamp: new Date(),
    status: "RECEIVED",
    pushName: "João",
    ...extra,
  }
}

describe("leitura das respostas vindas do WhatsApp", () => {
  it("guarda o que foi citado e quem escreveu", () => {
    const reply = normalizeMessage(
      {
        key: { id: "R1", remoteJid: JOAO, fromMe: false },
        message: {
          extendedTextMessage: {
            text: "Pode ser amanhã",
            contextInfo: {
              stanzaId: "ORIG1",
              participant: `5511000000000:7@s.whatsapp.net`,
              quotedMessage: { conversation: "Podemos conversar?" },
            },
          },
        },
        messageTimestamp: 1_700_000_000,
      },
      "5511000000000:3@s.whatsapp.net"
    )
    expect(reply?.quoted).toEqual({
      id: "ORIG1",
      fromMe: true,
      type: "text",
      body: "Podemos conversar?",
    })
  })

  it("entende resposta a uma foto e foto que responde", () => {
    const reply = normalizeMessage(
      {
        key: { id: "R2", remoteJid: JOAO, fromMe: false },
        message: {
          imageMessage: {
            caption: "assim?",
            contextInfo: {
              stanzaId: "ORIG2",
              participant: JOAO,
              quotedMessage: { imageMessage: { caption: "fachada" } },
            },
          },
        },
        messageTimestamp: 1_700_000_000,
      },
      ME
    )
    expect(reply).toMatchObject({ type: "image", body: "assim?" })
    expect(reply?.quoted).toMatchObject({
      id: "ORIG2",
      fromMe: false,
      type: "image",
      body: "fachada",
    })
    expect(quotePreview(reply!.quoted!)).toBe("📷 Foto: fachada")
  })

  it("mensagem comum não tem citação", () => {
    const plain = normalizeMessage(
      {
        key: { id: "P1", remoteJid: JOAO, fromMe: false },
        message: { conversation: "Oi" },
        messageTimestamp: 1_700_000_000,
      },
      ME
    )
    expect(plain?.quoted).toBeUndefined()
  })
})

let database: Awaited<ReturnType<typeof startTestDatabase>>
let sessionDir: string
let client: FakeWhatsAppClient

async function until(check: () => Promise<boolean>, timeoutMs = 3000) {
  const started = Date.now()
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error("timeout")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function connectWith(messages: WaMessage[]) {
  await whatsappSessionService.connect()
  client.on.onOpen({ phone: "5511000000000", pushName: "Eu" })
  client.on.onBatch({ chats: [], contacts: [], messages }, "offline")
  client.on.onCaughtUp()
  await until(
    async () => (await whatsappSessionService.snapshot()).status === "READY"
  )
  await until(
    async () =>
      (await WhatsAppMessageModel.countDocuments()) === messages.length
  )
}

async function conversationOf(jid: string) {
  const conversation = await WhatsAppConversationModel.findOne({
    whatsappChatId: jid,
  })
  return String(conversation?._id)
}

beforeAll(async () => {
  sessionDir = await mkdtemp(join(tmpdir(), "wa-quote-"))
  process.env.WHATSAPP_SESSION_DIR = sessionDir
  process.env.WHATSAPP_SESSION_NAME = "test-quote"
  database = await startTestDatabase("whatsapp-quote")
  await WhatsAppMessageModel.init()
  await WhatsAppConversationModel.init()
}, 120_000)

afterAll(async () => {
  resetWhatsAppRuntime()
  await database.stop()
  await rm(sessionDir, { recursive: true, force: true })
})

beforeEach(() => {
  resetWhatsAppRuntime()
  client = new FakeWhatsAppClient()
  configureWhatsAppRuntime({
    factory: () => client,
    settleMs: 20,
    maxSyncMs: 2000,
    reconnectDelayMs: 5,
  })
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

describe("responder pelo CRM", () => {
  it("envia como resposta e mostra a citação no histórico", async () => {
    await connectWith([incoming("ORIG", "Qual o preço do plano?")])
    const id = await conversationOf(JOAO)
    const original = await WhatsAppMessageModel.findOne({
      whatsappMessageId: "ORIG",
    })

    const sent = await whatsappSessionService.sendText(
      id,
      "R$ 99 por mês",
      String(original?._id)
    )

    expect(client.quotes).toEqual([
      {
        id: "ORIG",
        fromMe: false,
        type: "text",
        body: "Qual o preço do plano?",
      },
    ])
    expect(sent.quoted).toMatchObject({ whatsappMessageId: "ORIG" })

    const [latest] = (
      await whatsappConversationService.messages(id, { limit: 10 })
    ).items
    expect(latest.quoted).toEqual({
      whatsappMessageId: "ORIG",
      fromMe: false,
      type: "text",
      body: "Qual o preço do plano?",
    })
  })

  it("responde com imagem também", async () => {
    configureMediaStorage({
      put: async () => {},
      signedUrl: async (key) => `https://bucket.test/${key}`,
    })
    try {
      await connectWith([incoming("ORIG", "Manda uma foto")])
      const id = await conversationOf(JOAO)
      const original = await WhatsAppMessageModel.findOne()

      const sent = await whatsappSessionService.sendMedia(
        id,
        { kind: "image", data: Buffer.from("x"), mimeType: "image/jpeg" },
        String(original?._id)
      )
      expect(client.quotes).toEqual([
        { id: "ORIG", fromMe: false, type: "text", body: "Manda uma foto" },
      ])
      expect(sent).toMatchObject({
        type: "image",
        quoted: { whatsappMessageId: "ORIG" },
      })
    } finally {
      configureMediaStorage(undefined)
    }
  })

  it("recusa responder mensagem de outra conversa", async () => {
    await connectWith([
      incoming("J1", "Oi"),
      incoming("M1", "Olá", { chatJid: MARIA, from: MARIA, pushName: "Maria" }),
    ])
    const joao = await conversationOf(JOAO)
    const fromMaria = await WhatsAppMessageModel.findOne({
      whatsappMessageId: "M1",
    })

    await expect(
      whatsappSessionService.sendText(joao, "Oi", String(fromMaria?._id))
    ).rejects.toBeInstanceOf(WhatsAppActionError)
    expect(client.sent).toHaveLength(0)
  })
})

describe("citações recebidas", () => {
  it("usa o texto e o autor guardados quando a original está salva", async () => {
    await connectWith([
      incoming("MINE", "Podemos conversar amanhã?", {
        fromMe: true,
        from: ME,
        to: JOAO,
        status: "SENT",
      }),
    ])
    // WhatsApp sent a stale copy and no reliable author.
    client.on.onBatch(
      {
        chats: [],
        contacts: [],
        messages: [
          incoming("ANS", "Pode sim", {
            quoted: { id: "MINE", fromMe: false, type: "text", body: "Podem" },
          }),
        ],
      },
      "live"
    )
    await until(async () => (await WhatsAppMessageModel.countDocuments()) === 2)
    const id = await conversationOf(JOAO)

    const [answer] = (
      await whatsappConversationService.messages(id, { limit: 10 })
    ).items
    expect(answer.quoted).toEqual({
      whatsappMessageId: "MINE",
      fromMe: true,
      type: "text",
      body: "Podemos conversar amanhã?",
    })

    // The AI sees what the lead answered to.
    const context = await whatsappConversationService.context(id)
    expect(context).toContain(
      'João (respondendo a Você: "Podemos conversar amanhã?"): Pode sim'
    )
  })

  it("mantém a citação do WhatsApp quando a original não está salva", async () => {
    await connectWith([
      incoming("ANS2", "Esse aí", {
        quoted: { id: "OLD", fromMe: true, type: "image", body: "cardápio" },
      }),
    ])
    const id = await conversationOf(JOAO)
    const [answer] = (
      await whatsappConversationService.messages(id, { limit: 10 })
    ).items
    expect(answer.quoted).toEqual({
      whatsappMessageId: "OLD",
      fromMe: true,
      type: "image",
      body: "cardápio",
    })
  })
})
