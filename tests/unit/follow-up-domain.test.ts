import { describe, expect, it } from "vitest"

import {
  answeredSince,
  classifyAutoReply,
  conversationState,
  followUpDueAt,
  noReplyAt,
  onlyAutomatedReplies,
  wroteSince,
  type ConversationMessage,
} from "@/domain/follow-up"

const day = 24 * 60 * 60 * 1000
const at = (iso: string) => new Date(`${iso}-03:00`)

function text(body: string, secondsAfterOurMessage?: number) {
  return classifyAutoReply({ body, type: "text", secondsAfterOurMessage })
}

describe("classifyAutoReply", () => {
  it("reconhece saudações, avisos de ausência e menus", () => {
    expect(
      text(
        "Olá! Obrigado por entrar em contato com a Padaria Pão Quente. Em breve retornaremos sua mensagem."
      )
    ).toBe("automated")
    expect(text("Esta é uma mensagem automática.")).toBe("automated")
    expect(
      text("Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.")
    ).toBe("automated")
    expect(text("Seja bem-vindo à Ótica Visão! Digite 1 para orçamento")).toBe(
      "automated"
    )
    expect(
      text(
        "Escolha uma opção:\n1 - Pedidos\n2 - Financeiro\n3 - Falar com atendente"
      )
    ).toBe("automated")
    expect(
      text("¡Gracias por comunicarte con nosotros! En breve te responderemos.")
    ).toBe("automated")
    expect(text("Thank you for contacting us!")).toBe("automated")
  })

  it("respostas de gente são humanas, mesmo rápidas e curtas", () => {
    expect(text("Quem é?", 5)).toBe("human")
    expect(text("Não tenho interesse, obrigado", 20)).toBe("human")
    expect(text("Oi! Quanto custa?")).toBe("human")
    expect(text("Pode me mandar mais detalhes por aqui mesmo?", 600)).toBe(
      "human"
    )
  })

  it("frases ambíguas ou respostas longas instantâneas ficam para o Claude", () => {
    expect(text("Olá, como posso te ajudar?")).toBe("uncertain")
    expect(text("Obrigado pelo contato, mas não temos interesse.")).toBe(
      "uncertain"
    )
    expect(
      text(
        "Oi tudo bem, aqui é da loja, estamos com uma promoção de inverno em todos os produtos da vitrine hoje",
        3
      )
    ).toBe("uncertain")
  })

  it("mídia é sempre de uma pessoa", () => {
    expect(
      classifyAutoReply({ body: "", type: "audio", secondsAfterOurMessage: 2 })
    ).toBe("human")
  })
})

describe("estado da conversa", () => {
  const ours: ConversationMessage = {
    fromMe: true,
    timestamp: at("2026-10-01T10:00:00"),
    body: "Oi, vi que vocês não têm site",
  }
  const greeting: ConversationMessage = {
    fromMe: false,
    timestamp: at("2026-10-01T10:00:05"),
    body: "Obrigado pelo contato! Em breve retornaremos.",
    autoReply: "automated",
  }

  it("resposta automática não conta como resposta", () => {
    const state = conversationState([ours, greeting])
    expect(state.answered).toBe(false)
    expect(state.lastOutgoingAt).toEqual(ours.timestamp)
    expect(state.autoReplies).toEqual([greeting.body])
  })

  it("mensagem sem classificação conta como resposta de gente", () => {
    const legacy = { ...greeting, autoReply: undefined }
    expect(conversationState([ours, legacy]).answered).toBe(true)
  })

  it("resposta pendente não é resposta, mas deixa a conversa em dúvida", () => {
    const pending = { ...greeting, autoReply: "pending" as const }
    const state = conversationState([ours, pending])
    expect(state.answered).toBe(false)
    expect(state.undecided).toBe(true)
  })

  it("só a resposta depois da nossa última mensagem conta", () => {
    const earlier: ConversationMessage = {
      fromMe: false,
      timestamp: at("2026-09-20T10:00:00"),
      body: "Oi",
    }
    expect(conversationState([earlier, ours]).answered).toBe(false)
  })

  it("answeredSince e wroteSince olham só depois do momento dado", () => {
    const human: ConversationMessage = {
      fromMe: false,
      timestamp: at("2026-10-02T09:00:00"),
      body: "Tenho interesse",
      autoReply: "human",
    }
    expect(answeredSince([ours, greeting, human], ours.timestamp)).toBe(true)
    expect(answeredSince([ours, greeting], ours.timestamp)).toBe(false)
    expect(wroteSince([ours], ours.timestamp)).toBe(false)
    expect(
      wroteSince(
        [ours, { ...ours, timestamp: at("2026-10-02T10:00:00") }],
        ours.timestamp
      )
    ).toBe(true)
  })

  it("onlyAutomatedReplies acha leads que foram para Respondeu por robô", () => {
    expect(onlyAutomatedReplies([ours, greeting])).toEqual([greeting.body])
    expect(
      onlyAutomatedReplies([
        ours,
        greeting,
        { ...greeting, body: "Quero sim", autoReply: "human" },
      ])
    ).toBeNull()
    expect(onlyAutomatedReplies([ours])).toBeNull()
    expect(onlyAutomatedReplies([greeting])).toBeNull()
  })
})

describe("prazos", () => {
  it("follow-up em 3 dias e Perdido 3 dias depois do envio", () => {
    const anchor = at("2026-10-01T10:00:00")
    expect(followUpDueAt(anchor).getTime() - anchor.getTime()).toBe(3 * day)
    expect(noReplyAt(anchor).getTime() - anchor.getTime()).toBe(3 * day)
  })
})
