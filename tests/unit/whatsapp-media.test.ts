import { spawnSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import ffmpegPath from "ffmpeg-static"
import sharp from "sharp"
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

import type { WaMessage } from "@/lib/whatsapp/client"
import {
  configureMediaStorage,
  type MediaStorage,
} from "@/lib/storage/media-storage"
import { WhatsAppContactModel } from "@/models/whatsapp-contact.model"
import { WhatsAppDeletedChatModel } from "@/models/whatsapp-deleted-chat.model"
import { WhatsAppConversationModel } from "@/models/whatsapp-conversation.model"
import { WhatsAppMessageModel } from "@/models/whatsapp-message.model"
import { WhatsAppSessionModel } from "@/models/whatsapp-session.model"
import { whatsappConversationService } from "@/services/whatsapp/conversation.service"
import {
  MediaInputError,
  mediaSignedUrl,
  prepareOutgoingMedia,
} from "@/services/whatsapp/media.service"
import {
  configureWhatsAppRuntime,
  resetWhatsAppRuntime,
  WhatsAppActionError,
  whatsappSessionService,
} from "@/services/whatsapp/session.service"

const JOAO = "5511999998888@s.whatsapp.net"
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000",
  "hex"
)

class MemoryStorage implements MediaStorage {
  objects = new Map<string, { body: Buffer; contentType: string }>()
  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType })
  }
  async signedUrl(key: string) {
    return `https://bucket.test/${key}?signed`
  }
  async remove(keys: string[]) {
    for (const key of keys) this.objects.delete(key)
  }
}

function photo(id: string, download: () => Promise<Buffer>): WaMessage {
  return {
    id,
    chatJid: JOAO,
    fromMe: false,
    from: JOAO,
    to: "me",
    body: "olha a vitrine",
    type: "image",
    timestamp: new Date(),
    status: "RECEIVED",
    pushName: "João",
    media: { mimeType: "image/jpeg", download },
  }
}

function video(
  id: string,
  mimeType: string,
  download: () => Promise<Buffer>
): WaMessage {
  return {
    ...photo(id, download),
    type: "video",
    media: { mimeType, download },
  }
}

/** Two seconds of a heavy, barely compressed video, as Matroska. */
function rawVideo(): Buffer {
  return spawnSync(
    ffmpegPath as unknown as string,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=640x360:rate=30:duration=2",
      "-c:v",
      "mpeg4",
      "-q:v",
      "1",
      "-f",
      "matroska",
      "pipe:1",
    ],
    { maxBuffer: 50 * 1024 * 1024 }
  ).stdout
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
let storage: MemoryStorage

async function connect() {
  await whatsappSessionService.connect()
  client.on.onOpen({ phone: "5511000000000", pushName: "Eu" })
  client.on.onCaughtUp()
  await until(
    async () => (await whatsappSessionService.snapshot()).status === "READY"
  )
}

beforeAll(async () => {
  sessionDir = await mkdtemp(join(tmpdir(), "wa-media-"))
  process.env.WHATSAPP_SESSION_DIR = sessionDir
  process.env.WHATSAPP_SESSION_NAME = "test-media"
  database = await startTestDatabase("whatsapp-media")
  await WhatsAppMessageModel.init()
  await WhatsAppConversationModel.init()
}, 120_000)

afterAll(async () => {
  resetWhatsAppRuntime()
  configureMediaStorage(undefined)
  await database.stop()
  await rm(sessionDir, { recursive: true, force: true })
})

beforeEach(() => {
  resetWhatsAppRuntime()
  client = new FakeWhatsAppClient()
  storage = new MemoryStorage()
  configureMediaStorage(storage)
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
    WhatsAppDeletedChatModel.deleteMany({}),
  ])
})

describe("mídia recebida", () => {
  it("baixa a imagem, guarda no bucket e libera o link", async () => {
    await connect()
    client.on.onBatch(
      { chats: [], contacts: [], messages: [photo("img1", async () => PNG)] },
      "live"
    )
    await until(async () =>
      Boolean(await WhatsAppMessageModel.findOne({ "media.status": "stored" }))
    )

    const stored = await WhatsAppMessageModel.findOne().lean()
    // The real type wins over what WhatsApp said.
    expect(stored?.media).toMatchObject({
      mimeType: "image/png",
      size: PNG.length,
    })
    const key = stored?.media?.storageKey ?? ""
    expect(key).toMatch(/^whatsapp\/.+\/img1\.png$/)
    expect(storage.objects.get(key)?.body.equals(PNG)).toBe(true)

    const [message] = (
      await whatsappConversationService.messages(
        String(stored?.conversationId),
        { limit: 10 }
      )
    ).items
    expect(message.body).toBe("olha a vitrine")
    expect(message.mediaUrl).toBe(`/api/whatsapp/media/${message.id}`)
    expect(await mediaSignedUrl(message.id)).toBe(
      `https://bucket.test/${key}?signed`
    )
  })

  it("marca como indisponível quando o WhatsApp não entrega o arquivo", async () => {
    await connect()
    client.on.onBatch(
      {
        chats: [],
        contacts: [],
        messages: [
          photo("img2", async () => {
            throw new Error("410 gone")
          }),
        ],
      },
      "live"
    )
    await until(async () =>
      Boolean(await WhatsAppMessageModel.findOne({ "media.status": "failed" }))
    )
    expect(storage.objects.size).toBe(0)
  })

  it("comprime o vídeo recebido antes de guardar", async () => {
    const original = rawVideo()
    await connect()
    client.on.onBatch(
      {
        chats: [],
        contacts: [],
        messages: [video("vid1", "video/x-matroska", async () => original)],
      },
      "live"
    )
    await until(
      async () =>
        Boolean(
          await WhatsAppMessageModel.findOne({ "media.status": "stored" })
        ),
      20_000
    )

    const stored = await WhatsAppMessageModel.findOne().lean()
    expect(stored?.media?.mimeType).toBe("video/mp4")
    expect(stored?.media?.storageKey).toMatch(/vid1\.mp4$/)
    expect(stored?.media?.size).toBeLessThan(original.length)
    const object = storage.objects.get(stored?.media?.storageKey ?? "")
    expect(object?.body.subarray(4, 8).toString()).toBe("ftyp")
  }, 30_000)

  it("guarda o vídeo original quando não consegue comprimir", async () => {
    const original = Buffer.from("não é um vídeo de verdade")
    await connect()
    client.on.onBatch(
      {
        chats: [],
        contacts: [],
        messages: [video("vid2", "video/mp4", async () => original)],
      },
      "live"
    )
    await until(async () =>
      Boolean(await WhatsAppMessageModel.findOne({ "media.status": "stored" }))
    )

    const stored = await WhatsAppMessageModel.findOne().lean()
    expect(stored?.media).toMatchObject({
      mimeType: "video/mp4",
      size: original.length,
    })
  })

  it("sem bucket configurado, a mídia continua só como marcador", async () => {
    configureMediaStorage(null)
    await connect()
    client.on.onBatch(
      { chats: [], contacts: [], messages: [photo("img3", async () => PNG)] },
      "live"
    )
    await until(async () => (await WhatsAppMessageModel.countDocuments()) === 1)
    const stored = await WhatsAppMessageModel.findOne().lean()
    expect(stored?.type).toBe("image")
    expect(stored?.media).toBeUndefined()
    expect((await whatsappSessionService.snapshot()).mediaEnabled).toBe(false)
  })
})

describe("envio de mídia", () => {
  async function conversationId() {
    await connect()
    client.on.onBatch(
      {
        chats: [],
        contacts: [],
        messages: [
          {
            ...photo("first", async () => PNG),
            type: "text",
            media: undefined,
          },
        ],
      },
      "live"
    )
    await until(
      async () => (await WhatsAppConversationModel.countDocuments()) === 1
    )
    return String((await WhatsAppConversationModel.findOne())?._id)
  }

  it("envia a imagem com legenda e já devolve o link", async () => {
    const id = await conversationId()
    const sent = await whatsappSessionService.sendMedia(id, {
      kind: "image",
      data: PNG,
      mimeType: "image/png",
      caption: "nosso cardápio",
    })

    expect(client.sentMedia).toHaveLength(1)
    expect(client.sentMedia[0]).toMatchObject({
      chatJid: JOAO,
      media: { kind: "image", caption: "nosso cardápio" },
    })
    expect(sent).toMatchObject({
      fromMe: true,
      type: "image",
      body: "nosso cardápio",
      media: { status: "stored", mimeType: "image/png" },
    })
    expect(sent.mediaUrl).toBe(`/api/whatsapp/media/${sent.id}`)
    expect(storage.objects.size).toBe(1)
  })

  it("recusa enviar sem bucket configurado", async () => {
    const id = await conversationId()
    configureMediaStorage(null)
    await expect(
      whatsappSessionService.sendMedia(id, {
        kind: "image",
        data: PNG,
        mimeType: "image/png",
      })
    ).rejects.toBeInstanceOf(WhatsAppActionError)
    expect(client.sentMedia).toHaveLength(0)
  })
})

describe("preparar arquivo para envio", () => {
  it("recusa formatos que o WhatsApp não mostra e arquivos vazios", async () => {
    await expect(
      prepareOutgoingMedia({ data: PNG, mimeType: "application/pdf" })
    ).rejects.toBeInstanceOf(MediaInputError)
    await expect(
      prepareOutgoingMedia({ data: Buffer.alloc(0), mimeType: "image/png" })
    ).rejects.toBeInstanceOf(MediaInputError)
  })

  it("reduz e comprime a imagem antes de enviar", async () => {
    // A smooth, textured 2400x1800 PNG, like a photo saved by a phone.
    const raw = Buffer.alloc(400 * 300 * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251
    const big = await sharp(raw, {
      raw: { width: 400, height: 300, channels: 3 },
    })
      .resize(2400, 1800)
      .png()
      .toBuffer()

    const media = await prepareOutgoingMedia({
      data: big,
      mimeType: "image/png",
      caption: "  vitrine  ",
    })
    expect(media).toMatchObject({
      kind: "image",
      mimeType: "image/jpeg",
      caption: "vitrine",
    })
    expect(media.data.length).toBeLessThan(big.length / 3)
    const meta = await sharp(media.data).metadata()
    expect(meta.format).toBe("jpeg")
    expect([meta.width, meta.height]).toEqual([1600, 1200])
  })

  it("não aumenta imagens pequenas e recusa arquivo que não é imagem", async () => {
    const small = await sharp({
      create: { width: 300, height: 200, channels: 4, background: "#ff000080" },
    })
      .png()
      .toBuffer()
    const media = await prepareOutgoingMedia({
      data: small,
      mimeType: "image/png",
    })
    const meta = await sharp(media.data).metadata()
    expect([meta.width, meta.height]).toEqual([300, 200])

    await expect(
      prepareOutgoingMedia({
        data: Buffer.from("não sou png"),
        mimeType: "image/png",
      })
    ).rejects.toBeInstanceOf(MediaInputError)
  })

  it("converte a gravação em mensagem de voz ogg/opus", async () => {
    // One second of silence as WAV, standing in for a browser recording.
    const wav = spawnSync(
      ffmpegPath as unknown as string,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=stereo",
        "-t",
        "1",
        "-f",
        "wav",
        "pipe:1",
      ],
      { maxBuffer: 10 * 1024 * 1024 }
    ).stdout

    const media = await prepareOutgoingMedia({
      data: wav,
      mimeType: "audio/wav",
      voiceNote: true,
    })
    expect(media).toMatchObject({
      kind: "audio",
      mimeType: "audio/ogg; codecs=opus",
      voiceNote: true,
    })
    expect(media.data.subarray(0, 4).toString()).toBe("OggS")
  })
})

describe("excluir conversa", () => {
  it("apaga mensagens e arquivos, e a sincronização não traz de volta", async () => {
    await connect()
    const old = photo("old-img", async () => PNG)
    old.timestamp = new Date(Date.now() - 60_000)
    client.on.onBatch({ chats: [], contacts: [], messages: [old] }, "live")
    await until(async () => storage.objects.size === 1)
    const conversation = await WhatsAppConversationModel.findOne()
    const id = String(conversation?._id)

    expect(await whatsappSessionService.deleteConversation(id)).toBe(true)
    expect(await WhatsAppConversationModel.countDocuments()).toBe(0)
    expect(await WhatsAppMessageModel.countDocuments()).toBe(0)
    expect(storage.objects.size).toBe(0)
    // The contact stays known.
    expect(await WhatsAppContactModel.countDocuments()).toBe(1)

    // A later sync replays the old message and an unread count: ignored.
    client.on.onBatch(
      {
        chats: [{ jid: JOAO, unreadCount: 1 }],
        contacts: [],
        messages: [{ ...old, id: "old-text", type: "text", media: undefined }],
      },
      "offline"
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await WhatsAppConversationModel.countDocuments()).toBe(0)

    // Something new from the contact brings the chat back, new only.
    client.on.onBatch(
      {
        chats: [],
        contacts: [],
        messages: [
          {
            ...old,
            id: "new-text",
            type: "text",
            body: "voltei",
            media: undefined,
            timestamp: new Date(Date.now() + 1000),
          },
        ],
      },
      "live"
    )
    await until(
      async () => (await WhatsAppConversationModel.countDocuments()) === 1
    )
    const messages = await WhatsAppMessageModel.find().lean()
    expect(messages.map((item) => item.whatsappMessageId)).toEqual(["new-text"])
  })

  it("responde false para conversa que não existe", async () => {
    expect(
      await whatsappSessionService.deleteConversation(
        "64b000000000000000000000"
      )
    ).toBe(false)
  })
})
