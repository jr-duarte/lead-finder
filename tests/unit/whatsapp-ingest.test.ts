import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { startTestDatabase } from "../helpers/db"

import type { WaBatch, WaMessage } from "@/lib/whatsapp/client"
import { BusinessModel } from "@/models/business.model"
import { WhatsAppContactModel } from "@/models/whatsapp-contact.model"
import { WhatsAppConversationModel } from "@/models/whatsapp-conversation.model"
import { WhatsAppMessageModel } from "@/models/whatsapp-message.model"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"
import { whatsappConversationService } from "@/services/whatsapp/conversation.service"
import { ingestBatch } from "@/services/whatsapp/ingest.service"

let database: Awaited<ReturnType<typeof startTestDatabase>>

const JOAO = "5511999998888@s.whatsapp.net"
const MARIA = "5521988887777@s.whatsapp.net"

function message(overrides: Partial<WaMessage> & { id: string }): WaMessage {
  return {
    chatJid: JOAO,
    fromMe: false,
    from: JOAO,
    to: "me",
    body: "Oi",
    type: "text",
    timestamp: new Date("2026-10-01T09:30:00Z"),
    status: "RECEIVED",
    pushName: "João",
    ...overrides,
  }
}

function batch(partial: Partial<WaBatch>): WaBatch {
  return { chats: [], contacts: [], messages: [], ...partial }
}

let seed = 0
async function seedBusiness(name: string, phone: string) {
  const doc = await BusinessModel.create({
    name,
    phone,
    source: "manual",
    externalId: `wa-${(seed += 1)}`,
  })
  return String(doc._id)
}

beforeAll(async () => {
  database = await startTestDatabase("whatsapp-ingest")
  // Unique indexes must exist before the duplicate tests rely on them.
  await Promise.all([
    WhatsAppMessageModel.init(),
    WhatsAppConversationModel.init(),
    WhatsAppContactModel.init(),
  ])
}, 120_000)

afterAll(async () => {
  await database.stop()
})

afterEach(async () => {
  await Promise.all([
    BusinessModel.deleteMany({}),
    WhatsAppContactModel.deleteMany({}),
    WhatsAppConversationModel.deleteMany({}),
    WhatsAppMessageModel.deleteMany({}),
  ])
})

describe("ingestBatch", () => {
  it("cria contato e conversa a partir da primeira mensagem", async () => {
    const result = await ingestBatch(
      batch({ messages: [message({ id: "m1" })] }),
      "offline"
    )

    expect(result.newMessages).toBe(1)

    const contact = await WhatsAppContactModel.findOne({ whatsappId: JOAO })
    expect(contact?.phone).toBe("5511999998888")
    expect(contact?.pushName).toBe("João")

    const conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(conversation?.title).toBe("João")
    expect(String(conversation?.contactId)).toBe(String(contact?._id))
    expect(conversation?.lastMessage).toBe("Oi")
  })

  it("recupera mensagens recebidas com o CRM fechado, na ordem", async () => {
    // João escreve às 09:30 e às 10:00; o CRM só abre às 11:00.
    await ingestBatch(
      batch({
        messages: [
          message({ id: "m1", body: "Oi" }),
          message({
            id: "m2",
            body: "Você está aí?",
            timestamp: new Date("2026-10-01T10:00:00Z"),
          }),
        ],
      }),
      "offline"
    )

    const conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    const page = await whatsappConversationService.messages(
      String(conversation?._id),
      { limit: 10 }
    )

    expect(page.items.map((item) => item.body)).toEqual(["Você está aí?", "Oi"])
    expect(conversation?.lastMessage).toBe("Você está aí?")
    expect(conversation?.unreadCount).toBe(2)
  })

  it("sync() três vezes não duplica nada", async () => {
    const same = batch({
      messages: [
        message({ id: "m1" }),
        message({ id: "m2", timestamp: new Date("2026-10-01T10:00:00Z") }),
        message({
          id: "m3",
          chatJid: MARIA,
          from: MARIA,
          pushName: "Maria",
          body: "Obrigada!",
        }),
      ],
    })

    const first = await ingestBatch(same, "offline")
    const second = await ingestBatch(same, "offline")
    const third = await ingestBatch(same, "offline")

    expect(first.newMessages).toBe(3)
    expect(second.newMessages).toBe(0)
    expect(third.newMessages).toBe(0)
    expect(await WhatsAppMessageModel.countDocuments()).toBe(3)
    expect(await WhatsAppConversationModel.countDocuments()).toBe(2)
    expect(await WhatsAppContactModel.countDocuments()).toBe(2)

    // Replays never inflate the unread counter.
    const joao = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(joao?.unreadCount).toBe(2)
  })

  it("lotes concorrentes com a mesma mensagem gravam uma só cópia", async () => {
    const same = batch({ messages: [message({ id: "race" })] })
    const results = await Promise.all([
      ingestBatch(same, "live"),
      ingestBatch(same, "live"),
      ingestBatch(same, "live"),
    ])

    expect(results.reduce((sum, item) => sum + item.newMessages, 0)).toBe(1)
    expect(await WhatsAppMessageModel.countDocuments()).toBe(1)
  })

  it("sincronização incremental ignora histórico fora da janela", async () => {
    const since = new Date("2026-10-01T00:00:00Z")
    const result = await ingestBatch(
      batch({
        messages: [
          message({ id: "old", timestamp: new Date("2026-09-01T12:00:00Z") }),
          message({ id: "new", timestamp: new Date("2026-10-01T12:00:00Z") }),
        ],
      }),
      "history",
      { historySince: since }
    )

    expect(result.newMessages).toBe(1)
    expect(
      await WhatsAppMessageModel.exists({ whatsappMessageId: "old" })
    ).toBeNull()
  })

  it("mensagens ao vivo e offline nunca são filtradas pela janela", async () => {
    const result = await ingestBatch(
      batch({
        messages: [
          message({ id: "late", timestamp: new Date("2026-09-01T12:00:00Z") }),
        ],
      }),
      "offline",
      { historySince: new Date("2026-10-01T00:00:00Z") }
    )
    expect(result.newMessages).toBe(1)
  })

  it("histórico não conta como não lida; o contador do WhatsApp prevalece", async () => {
    await ingestBatch(
      batch({ messages: [message({ id: "h1" }), message({ id: "h2" })] }),
      "history"
    )
    let conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(conversation?.unreadCount).toBe(0)

    await ingestBatch(batch({ chats: [{ jid: JOAO, unreadCount: 1 }] }), "live")
    conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(conversation?.unreadCount).toBe(1)
  })

  it("mensagens enviadas não contam como não lidas", async () => {
    await ingestBatch(
      batch({
        messages: [
          message({
            id: "out",
            fromMe: true,
            from: "me",
            to: JOAO,
            status: "SENT",
            body: "Sim, vou te enviar",
          }),
        ],
      }),
      "live"
    )
    const conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(conversation?.unreadCount).toBe(0)
    expect(conversation?.lastMessageFromMe).toBe(true)
  })

  it("uma mensagem antiga que chega depois não substitui a última", async () => {
    await ingestBatch(
      batch({
        messages: [
          message({
            id: "recent",
            body: "Beleza",
            timestamp: new Date("2026-10-01T11:00:00Z"),
          }),
        ],
      }),
      "live"
    )
    await ingestBatch(
      batch({
        messages: [
          message({
            id: "older",
            body: "Você conseguiu ver o site?",
            timestamp: new Date("2026-10-01T08:00:00Z"),
          }),
        ],
      }),
      "offline"
    )

    const conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(conversation?.lastMessage).toBe("Beleza")
    expect(conversation?.lastMessageAt?.toISOString()).toBe(
      "2026-10-01T11:00:00.000Z"
    )
  })

  it("mídia aparece na lista com um marcador", async () => {
    await ingestBatch(
      batch({ messages: [message({ id: "img", type: "image", body: "" })] }),
      "live"
    )
    const conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(conversation?.lastMessage).toBe("[imagem]")
  })

  it("não importa chats antigos sem mensagens na janela", async () => {
    await ingestBatch(
      batch({ chats: [{ jid: MARIA, name: "Maria", unreadCount: 0 }] }),
      "history"
    )
    expect(await WhatsAppConversationModel.countDocuments()).toBe(0)
  })

  it("o nome salvo na agenda vence o nome do perfil", async () => {
    await ingestBatch(batch({ messages: [message({ id: "m1" })] }), "live")
    await ingestBatch(
      batch({ contacts: [{ jid: JOAO, name: "João Silva" }] }),
      "history"
    )
    const conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(conversation?.title).toBe("João Silva")
  })

  it("unifica uma conversa iniciada por LID quando o telefone é descoberto", async () => {
    const lid = "999@lid"
    await ingestBatch(
      batch({
        messages: [message({ id: "l1", chatJid: lid, from: lid, body: "Oi" })],
      }),
      "live"
    )
    await ingestBatch(
      batch({
        messages: [
          message({
            id: "p1",
            body: "Sou eu",
            timestamp: new Date("2026-10-01T10:00:00Z"),
          }),
        ],
      }),
      "live"
    )
    expect(await WhatsAppConversationModel.countDocuments()).toBe(2)

    await ingestBatch(
      batch({
        contacts: [
          { jid: JOAO, lid, phone: "5511999998888", pushName: "João" },
        ],
      }),
      "live"
    )

    const conversations = await WhatsAppConversationModel.find()
    expect(conversations).toHaveLength(1)
    expect(conversations[0].whatsappChatId).toBe(JOAO)
    expect(conversations[0].unreadCount).toBe(2)
    expect(
      await WhatsAppMessageModel.countDocuments({
        conversationId: conversations[0]._id,
      })
    ).toBe(2)
    expect(await WhatsAppContactModel.countDocuments()).toBe(1)
  })
})

describe("conversas duplicadas por LID", () => {
  const LID = "262332861120687@lid"

  it("aviso de chat só com LID e sem mensagem não abre conversa vazia", async () => {
    // The reply is stored under the phone number...
    await ingestBatch(batch({ messages: [message({ id: "r1" })] }), "live")
    // ...while WhatsApp reports the unread chat only by LID.
    const result = await ingestBatch(
      batch({ chats: [{ jid: LID, name: "Julia", unreadCount: 1 }] }),
      "live"
    )

    expect(result.conversationIds).toEqual([])
    const conversations = await WhatsAppConversationModel.find()
    expect(conversations.map((item) => item.whatsappChatId)).toEqual([JOAO])
  })

  it("a conversa por LID nasce quando chega mensagem por ela", async () => {
    await ingestBatch(batch({ chats: [{ jid: LID, unreadCount: 1 }] }), "live")
    expect(await WhatsAppConversationModel.countDocuments()).toBe(0)

    await ingestBatch(
      batch({
        messages: [message({ id: "l1", chatJid: LID, from: LID })],
      }),
      "live"
    )
    expect(
      await WhatsAppConversationModel.countDocuments({ whatsappChatId: LID })
    ).toBe(1)
  })

  it("limpa só as conversas por LID vazias e sem lead", async () => {
    const leadId = await seedBusiness("Padaria", "(21) 98888-7777")
    await ingestBatch(
      batch({
        messages: [
          message({ id: "keep", chatJid: "111@lid", from: "111@lid" }),
          message({ id: "pn" }),
        ],
      }),
      "live"
    )
    const contact = await whatsappConversationRepository.upsertContact({
      jid: "222@lid",
    })
    await whatsappConversationRepository.ensureConversation("222@lid", contact)
    const linkedContact = await whatsappConversationRepository.upsertContact({
      jid: "333@lid",
    })
    const { conversation: linked } =
      await whatsappConversationRepository.ensureConversation(
        "333@lid",
        linkedContact
      )
    await whatsappConversationRepository.setLead(linked.id, leadId, "manual")

    expect(
      await whatsappConversationRepository.removeEmptyLidConversations()
    ).toBe(1)
    const left = (await WhatsAppConversationModel.find())
      .map((item) => item.whatsappChatId)
      .sort()
    expect(left).toEqual(["111@lid", "333@lid", JOAO].sort())
  })
})

describe("vínculo com Lead", () => {
  it("vincula automaticamente quando um único lead tem o telefone", async () => {
    const businessId = await seedBusiness("Padaria XYZ", "(11) 99999-8888")

    await ingestBatch(batch({ messages: [message({ id: "m1" })] }), "live")

    const conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(String(conversation?.businessId)).toBe(businessId)
    expect(conversation?.leadLinkSource).toBe("auto")
  })

  it("não vincula quando o telefone é ambíguo", async () => {
    await seedBusiness("Padaria XYZ", "(11) 99999-8888")
    await seedBusiness("Padaria XYZ Filial", "+55 11 9999-8888")

    await ingestBatch(batch({ messages: [message({ id: "m1" })] }), "live")

    const conversation = await WhatsAppConversationModel.findOne({
      whatsappChatId: JOAO,
    })
    expect(conversation?.businessId).toBeNull()
  })

  it("não cria lead quando nenhum corresponde", async () => {
    await ingestBatch(batch({ messages: [message({ id: "m1" })] }), "live")
    expect(await BusinessModel.countDocuments()).toBe(0)
  })

  it("vínculo manual e desvínculo são respeitados", async () => {
    const businessId = await seedBusiness("Padaria XYZ", "(21) 3333-4444")
    await ingestBatch(batch({ messages: [message({ id: "m1" })] }), "live")
    const conversation =
      await whatsappConversationRepository.findByChatJid(JOAO)

    const linked = await whatsappConversationService.linkLead(
      conversation!.id,
      businessId
    )
    expect(linked).not.toBe("lead-not-found")
    expect(linked && linked !== "lead-not-found" && linked.lead?.name).toBe(
      "Padaria XYZ"
    )

    await whatsappConversationService.linkLead(conversation!.id, null)
    const unlinked = await whatsappConversationRepository.findById(
      conversation!.id
    )
    expect(unlinked?.businessId).toBeUndefined()
    expect(unlinked?.leadLinkSource).toBe("manual")
  })

  it("recusa vincular a um lead inexistente", async () => {
    await ingestBatch(batch({ messages: [message({ id: "m1" })] }), "live")
    const conversation =
      await whatsappConversationRepository.findByChatJid(JOAO)
    const result = await whatsappConversationService.linkLead(
      conversation!.id,
      "64b000000000000000000000"
    )
    expect(result).toBe("lead-not-found")
  })
})

describe("histórico paginado", () => {
  it("pagina do mais novo para o mais antigo sem pular mensagens", async () => {
    // Several messages share a timestamp to exercise the tie-break.
    const same = new Date("2026-10-01T10:00:00Z")
    await ingestBatch(
      batch({
        messages: Array.from({ length: 7 }, (_, index) =>
          message({
            id: `p${index}`,
            body: `msg ${index}`,
            timestamp: index < 4 ? same : new Date(same.getTime() + index),
          })
        ),
      }),
      "live"
    )
    const conversation =
      await whatsappConversationRepository.findByChatJid(JOAO)

    const seen: string[] = []
    let before: string | undefined
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await whatsappConversationService.messages(
        conversation!.id,
        {
          before,
          limit: 3,
        }
      )
      seen.push(...page.items.map((item) => item.whatsappMessageId))
      if (!page.nextCursor) break
      before = page.nextCursor
    }

    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
  })
})
