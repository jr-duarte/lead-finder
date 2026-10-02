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

import { startTestDatabase } from "../helpers/db"
import { FakeWhatsAppClient } from "../helpers/fake-whatsapp"

import { WhatsAppContactModel } from "@/models/whatsapp-contact.model"
import { WhatsAppConversationModel } from "@/models/whatsapp-conversation.model"
import { WhatsAppMessageModel } from "@/models/whatsapp-message.model"
import { WhatsAppSessionModel } from "@/models/whatsapp-session.model"
import {
  conversationAvatar,
  pictureValidUntil,
} from "@/services/whatsapp/avatar.service"
import {
  configureWhatsAppRuntime,
  resetWhatsAppRuntime,
  whatsappSessionService,
} from "@/services/whatsapp/session.service"

const JOAO = "5511999998888@s.whatsapp.net"
const JPEG = Buffer.from("ffd8ffe000104a464946", "hex")
const HOUR = 60 * 60 * 1000

/** A WhatsApp-like signed link expiring `ms` from now. */
function pictureUrl(name: string, ms = 48 * HOUR) {
  const oe = Math.floor((Date.now() + ms) / 1000).toString(16)
  return `https://pps.test/${name}.jpg?oe=${oe}`
}

async function until(check: () => Promise<boolean>, timeoutMs = 3000) {
  const started = Date.now()
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error("timeout")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

let database: Awaited<ReturnType<typeof startTestDatabase>>
let sessionDir: string
let client: FakeWhatsAppClient
/** Links the fake CDN still serves; anything else answers 403. */
let served: Set<string>
let downloads: string[]

async function connect() {
  await whatsappSessionService.connect()
  client.on.onOpen({ phone: "5511000000000", pushName: "Eu" })
  client.on.onCaughtUp()
  await until(
    async () => (await whatsappSessionService.snapshot()).status === "READY"
  )
}

/** Opens a conversation with João and returns its id. */
async function joaoConversation(): Promise<string> {
  client.on.onBatch(
    {
      chats: [],
      contacts: [],
      messages: [
        {
          id: "m1",
          chatJid: JOAO,
          fromMe: false,
          from: JOAO,
          to: "me",
          body: "oi",
          type: "text",
          timestamp: new Date(),
          status: "RECEIVED",
          pushName: "João",
        },
      ],
    },
    "live"
  )
  await until(async () => Boolean(await WhatsAppConversationModel.findOne()))
  const conversation = await WhatsAppConversationModel.findOne().lean()
  return String(conversation?._id)
}

beforeAll(async () => {
  sessionDir = await mkdtemp(join(tmpdir(), "wa-avatar-"))
  process.env.WHATSAPP_SESSION_DIR = sessionDir
  process.env.WHATSAPP_SESSION_NAME = "test-avatar"
  database = await startTestDatabase("whatsapp-avatar")
  await WhatsAppConversationModel.init()
}, 120_000)

afterAll(async () => {
  resetWhatsAppRuntime()
  vi.unstubAllGlobals()
  await database.stop()
  await rm(sessionDir, { recursive: true, force: true })
})

beforeEach(() => {
  resetWhatsAppRuntime()
  client = new FakeWhatsAppClient()
  served = new Set()
  downloads = []
  vi.stubGlobal("fetch", async (url: string) => {
    downloads.push(url)
    return served.has(url)
      ? new Response(new Uint8Array(JPEG), {
          headers: { "content-type": "image/jpeg" },
        })
      : new Response(null, { status: 403 })
  })
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

describe("validade da foto em cache", () => {
  const checkedAt = new Date("2026-10-01T12:00:00Z")

  it("nunca consultada: precisa consultar", () => {
    expect(pictureValidUntil({})).toBe(0)
  })

  it("sem foto: vale um dia", () => {
    expect(pictureValidUntil({ profilePictureCheckedAt: checkedAt })).toBe(
      checkedAt.getTime() + 24 * HOUR
    )
  })

  it("com link: vale até uma hora antes de o link expirar", () => {
    const expires = checkedAt.getTime() + 10 * HOUR
    const oe = Math.floor(expires / 1000).toString(16)
    expect(
      pictureValidUntil({
        profilePicture: `https://pps.test/a.jpg?oe=${oe}`,
        profilePictureCheckedAt: checkedAt,
      })
    ).toBe(expires - HOUR)
  })
})

describe("foto do contato", () => {
  it("busca no WhatsApp uma vez e reaproveita o link", async () => {
    await connect()
    const id = await joaoConversation()
    const url = pictureUrl("joao")
    client.pictures.set(JOAO, url)
    served.add(url)

    const first = await conversationAvatar(id)
    expect(first?.data.equals(JPEG)).toBe(true)
    expect(first?.contentType).toBe("image/jpeg")
    await conversationAvatar(id)

    expect(client.pictureRequests).toEqual([JOAO])
    expect(downloads).toEqual([url, url])
  })

  it("sem foto devolve null e não pergunta de novo no mesmo dia", async () => {
    await connect()
    const id = await joaoConversation()

    expect(await conversationAvatar(id)).toBeNull()
    expect(await conversationAvatar(id)).toBeNull()
    expect(client.pictureRequests).toEqual([JOAO])
  })

  it("quando o contato troca a foto, consulta de novo", async () => {
    await connect()
    const id = await joaoConversation()
    await conversationAvatar(id)

    const url = pictureUrl("nova")
    client.pictures.set(JOAO, url)
    served.add(url)
    client.on.onBatch(
      {
        chats: [],
        contacts: [{ jid: JOAO, pictureChanged: true }],
        messages: [],
      },
      "live"
    )
    await until(async () =>
      Boolean(
        await WhatsAppContactModel.findOne({
          whatsappId: JOAO,
          profilePictureCheckedAt: { $exists: false },
        })
      )
    )

    expect((await conversationAvatar(id))?.data.equals(JPEG)).toBe(true)
    expect(client.pictureRequests).toEqual([JOAO, JOAO])
  })

  it("link que expirou antes da hora é renovado", async () => {
    await connect()
    const id = await joaoConversation()
    const old = pictureUrl("velha")
    client.pictures.set(JOAO, old)
    served.add(old)
    await conversationAvatar(id)

    // The CDN stops serving the old link; WhatsApp hands out a new one.
    served.delete(old)
    const renewed = pictureUrl("renovada")
    client.pictures.set(JOAO, renewed)
    served.add(renewed)

    expect((await conversationAvatar(id))?.data.equals(JPEG)).toBe(true)
    expect(downloads.slice(-2)).toEqual([old, renewed])
  })

  it("falha na consulta não vira erro nem fica em cache", async () => {
    await connect()
    const id = await joaoConversation()
    const url = pictureUrl("joao")
    client.pictures.set(JOAO, url)
    served.add(url)
    client.failPictures = 1

    expect(await conversationAvatar(id)).toBeNull()
    expect((await conversationAvatar(id))?.data.equals(JPEG)).toBe(true)
    expect(client.pictureRequests).toEqual([JOAO, JOAO])
  })

  it("desconectado e sem cache, fica sem foto", async () => {
    const conversationId = await (async () => {
      await connect()
      return joaoConversation()
    })()
    resetWhatsAppRuntime()

    expect(await conversationAvatar(conversationId)).toBeNull()
    expect(client.pictureRequests).toEqual([])
  })
})
