import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Business } from "@/domain/business"
import type { WhatsAppConversation, WhatsAppMessage } from "@/domain/whatsapp"

const conversation: WhatsAppConversation = {
  id: "c1",
  contactId: "k1",
  whatsappChatId: "5511999998888@s.whatsapp.net",
  title: "João",
  phone: "5511999998888",
  unreadCount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function message(
  id: string,
  body: string,
  fromMe: boolean,
  at: string,
  type: WhatsAppMessage["type"] = "text"
): WhatsAppMessage {
  return {
    id,
    conversationId: "c1",
    whatsappMessageId: id,
    from: fromMe ? "me" : conversation.whatsappChatId,
    to: fromMe ? conversation.whatsappChatId : "me",
    body,
    type,
    timestamp: new Date(at),
    fromMe,
    status: fromMe ? "SENT" : "RECEIVED",
    createdAt: new Date(at),
  }
}

const history = [
  message("m1", "Oi, vi o anúncio de vocês", false, "2026-10-01T12:00:00Z"),
  message("m2", "Oi João! Tudo certo?", true, "2026-10-01T12:05:00Z"),
  message("m3", "", false, "2026-10-01T12:06:00Z", "image"),
  message("m4", "Quanto custa um site?", false, "2026-10-01T12:07:00Z"),
]

const lead = {
  id: "b1",
  name: "Padaria XYZ",
  category: "Padaria",
  address: { city: "São Paulo" },
  enrichment: { emails: [], socials: {}, technologies: [] },
  status: "NEW",
  searchIds: [],
} as unknown as Business

const state = {
  conversation: conversation as WhatsAppConversation | null,
  messages: history,
  reply: {
    reply: "Depende do que você precisa — me conta?",
    rationale: "Pergunta antes de passar preço.",
  },
  delayMs: 0,
}

const runClaude = vi.fn(async () => {
  await new Promise((resolve) => setTimeout(resolve, state.delayMs))
  return state.reply
})

vi.mock("@/lib/claude-cli", () => ({
  ClaudeCliError: class extends Error {},
  runClaude: (...args: unknown[]) => runClaude(...(args as [])),
}))

vi.mock("@/repositories/whatsapp-conversation.repository", () => ({
  whatsappConversationRepository: {
    findById: vi.fn(async () => state.conversation),
  },
}))

vi.mock("@/repositories/whatsapp-message.repository", () => ({
  whatsappMessageRepository: {
    recent: vi.fn(async () => state.messages),
  },
}))

vi.mock("@/repositories/business.repository", () => ({
  businessRepository: { findById: vi.fn(async () => lead) },
}))

vi.mock("@/repositories/note.repository", () => ({
  noteRepository: { listByBusiness: vi.fn(async () => []) },
}))

vi.mock("@/repositories/settings.repository", () => ({
  settingsRepository: {
    getSeller: vi.fn(async () => ({
      sellerName: "Ana",
      offer: "Sites para pequenos negócios",
      instructions: "informal",
    })),
  },
}))

const { buildReplyPrompt, replySuggestionService, ReplySuggestionError } =
  await import("@/services/whatsapp/reply-suggestion.service")

const seller = {
  sellerName: "Ana",
  offer: "Sites para pequenos negócios",
}

beforeEach(() => {
  runClaude.mockClear()
  state.conversation = conversation
  state.messages = history
  state.delayMs = 0
})

describe("buildReplyPrompt", () => {
  it("traz a conversa em ordem, com quem disse o quê e a mídia marcada", () => {
    const prompt = buildReplyPrompt({
      conversation,
      messages: history,
      lead: null,
      notes: [],
      seller,
    })

    expect(prompt).toMatch(/^Escreva a minha próxima mensagem/)
    const first = prompt.indexOf("João: Oi, vi o anúncio")
    const mine = prompt.indexOf("Eu: Oi João! Tudo certo?")
    const image = prompt.indexOf("João: [imagem]")
    const last = prompt.indexOf("João: Quanto custa um site?")
    expect(first).toBeGreaterThan(-1)
    expect(first).toBeLessThan(mine)
    expect(mine).toBeLessThan(image)
    expect(image).toBeLessThan(last)
  })

  it("sem lead, descreve o vendedor e diz que o contato não está vinculado", () => {
    const prompt = buildReplyPrompt({
      conversation,
      messages: history,
      lead: null,
      notes: [],
      seller,
    })
    expect(prompt).toContain("- Oferta: Sites para pequenos negócios")
    expect(prompt).toContain("Não está vinculado a nenhum lead")
  })

  it("com lead, usa a ficha completa do lead", () => {
    const prompt = buildReplyPrompt({
      conversation,
      messages: history,
      lead,
      notes: [],
      seller,
    })
    expect(prompt).toContain("## Lead")
    expect(prompt).toContain("Padaria XYZ")
    expect(prompt).not.toContain("Não está vinculado")
  })

  it("com rascunho, pede para melhorar mantendo a intenção", () => {
    const prompt = buildReplyPrompt({
      conversation,
      messages: history,
      lead: null,
      notes: [],
      seller,
      draft: "  fica uns 1500 mas depende  ",
    })
    expect(prompt).toMatch(/^Melhore o rascunho/)
    expect(prompt).toContain("## Meu rascunho\nfica uns 1500 mas depende")
  })
})

describe("replySuggestionService", () => {
  it("devolve a sugestão sem travessões e não envia nada", async () => {
    const suggestion = await replySuggestionService.suggest("c1")
    expect(suggestion.reply).toBe("Depende do que você precisa, me conta?")
    expect(suggestion.rationale).toBe("Pergunta antes de passar preço.")
    expect(runClaude).toHaveBeenCalledTimes(1)
  })

  it("recusa uma segunda sugestão enquanto a primeira está sendo escrita", async () => {
    state.delayMs = 50
    const first = replySuggestionService.suggest("c1")
    await expect(replySuggestionService.suggest("c1")).rejects.toMatchObject({
      status: 409,
    })
    await first
    // Once done, a new request is accepted.
    await expect(replySuggestionService.suggest("c1")).resolves.toBeTruthy()
  })

  it("conversa inexistente dá 404", async () => {
    state.conversation = null
    await expect(replySuggestionService.suggest("c1")).rejects.toBeInstanceOf(
      ReplySuggestionError
    )
    expect(runClaude).not.toHaveBeenCalled()
  })

  it("conversa vazia sem rascunho dá 422, com rascunho funciona", async () => {
    state.messages = []
    await expect(replySuggestionService.suggest("c1")).rejects.toMatchObject({
      status: 422,
    })
    await expect(
      replySuggestionService.suggest("c1", { draft: "oi, tudo bem?" })
    ).resolves.toBeTruthy()
  })
})
