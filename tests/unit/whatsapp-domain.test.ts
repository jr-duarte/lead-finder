import { describe, expect, it } from "vitest"

import {
  contactDisplayName,
  formatWhatsAppPhone,
  leadWhatsAppCandidates,
  lowerMessageStatuses,
  phoneMatchKey,
  toWhatsAppNumber,
} from "@/domain/whatsapp"
import {
  canonicalJid,
  isIgnoredJid,
  normalizeContact,
  normalizeMessage,
  phoneFromJid,
  statusFromAck,
} from "@/lib/whatsapp/baileys-normalize"

describe("phoneMatchKey", () => {
  it("iguala celulares brasileiros com e sem nono dígito e DDI", () => {
    const key = phoneMatchKey("5511999998888")
    expect(key).toBe("551199998888")
    expect(phoneMatchKey("(11) 99999-8888")).toBe(key)
    expect(phoneMatchKey("+55 11 9999-8888")).toBe(key)
    expect(phoneMatchKey("551199998888")).toBe(key)
  })

  it("não confunde DDDs diferentes", () => {
    expect(phoneMatchKey("(21) 99999-8888")).not.toBe(
      phoneMatchKey("(11) 99999-8888")
    )
  })

  it("ignora valores curtos ou vazios", () => {
    expect(phoneMatchKey("")).toBeUndefined()
    expect(phoneMatchKey("1234")).toBeUndefined()
    expect(phoneMatchKey(undefined)).toBeUndefined()
  })

  it("mantém números estrangeiros como dígitos", () => {
    expect(phoneMatchKey("+1 415 555 0100")).toBe("14155550100")
    expect(phoneMatchKey("14155550100", { international: true })).toBe(
      "14155550100"
    )
  })
})

describe("helpers de exibição", () => {
  it("formata o telefone do WhatsApp", () => {
    expect(formatWhatsAppPhone("5511999998888")).toBe("+55 11 99999-8888")
    expect(formatWhatsAppPhone("14155550100")).toBe("+14155550100")
  })

  it("escolhe o melhor nome do contato", () => {
    expect(contactDisplayName({ name: "João", pushName: "Jão" })).toBe("João")
    expect(contactDisplayName({ pushName: "Jão" })).toBe("Jão")
    expect(contactDisplayName({ phone: "5511999998888" })).toBe(
      "+5511999998888"
    )
  })

  it("status de entrega só avança", () => {
    expect(lowerMessageStatuses("READ")).toEqual([
      "PENDING",
      "SENT",
      "DELIVERED",
    ])
    expect(lowerMessageStatuses("PENDING")).toEqual([])
    expect(lowerMessageStatuses("RECEIVED")).toEqual([])
  })
})

describe("normalização do Baileys", () => {
  it("prefere o jid de telefone ao LID", () => {
    expect(canonicalJid("123@lid", "5511999998888@s.whatsapp.net")).toBe(
      "5511999998888@s.whatsapp.net"
    )
    expect(canonicalJid("123@lid")).toBe("123@lid")
    expect(canonicalJid("5511999998888:12@s.whatsapp.net")).toBe(
      "5511999998888@s.whatsapp.net"
    )
  })

  it("extrai telefone apenas de jids de telefone", () => {
    expect(phoneFromJid("5511999998888@s.whatsapp.net")).toBe("5511999998888")
    expect(phoneFromJid("123@lid")).toBeUndefined()
  })

  it("ignora status, listas de transmissão e grupos (por padrão)", () => {
    expect(isIgnoredJid("status@broadcast", true)).toBe(true)
    expect(isIgnoredJid("120363@g.us", false)).toBe(true)
    expect(isIgnoredJid("120363@g.us", true)).toBe(false)
    expect(isIgnoredJid("5511999998888@s.whatsapp.net", false)).toBe(false)
  })

  it("converte uma mensagem de texto recebida", () => {
    const message = normalizeMessage(
      {
        key: {
          id: "ABC",
          remoteJid: "5511999998888@s.whatsapp.net",
          fromMe: false,
        },
        message: { conversation: "Oi" },
        messageTimestamp: 1_700_000_000,
        pushName: "João",
      },
      "5511000000000:3@s.whatsapp.net"
    )

    expect(message).toMatchObject({
      id: "ABC",
      chatJid: "5511999998888@s.whatsapp.net",
      fromMe: false,
      from: "5511999998888@s.whatsapp.net",
      to: "5511000000000@s.whatsapp.net",
      body: "Oi",
      type: "text",
      status: "RECEIVED",
      pushName: "João",
    })
    expect(message?.timestamp.getTime()).toBe(1_700_000_000_000)
  })

  it("usa o jid alternativo quando a mensagem chega por LID", () => {
    const message = normalizeMessage({
      key: {
        id: "L1",
        remoteJid: "999@lid",
        remoteJidAlt: "5511999998888@s.whatsapp.net",
        fromMe: false,
      },
      message: { extendedTextMessage: { text: "Olá" } },
      messageTimestamp: 1_700_000_000,
    })
    expect(message?.chatJid).toBe("5511999998888@s.whatsapp.net")
    expect(message?.body).toBe("Olá")
  })

  it("classifica mídia e descarta mensagens de protocolo", () => {
    const image = normalizeMessage({
      key: { id: "I1", remoteJid: "5511999998888@s.whatsapp.net" },
      message: { imageMessage: { caption: "foto da fachada" } },
      messageTimestamp: 1_700_000_000,
    })
    expect(image).toMatchObject({ type: "image", body: "foto da fachada" })

    const reaction = normalizeMessage({
      key: { id: "R1", remoteJid: "5511999998888@s.whatsapp.net" },
      message: { reactionMessage: { text: "👍" } },
      messageTimestamp: 1_700_000_000,
    })
    expect(reaction).toBeNull()

    const empty = normalizeMessage({
      key: { id: "E1", remoteJid: "5511999998888@s.whatsapp.net" },
      messageTimestamp: 1_700_000_000,
    })
    expect(empty).toBeNull()
  })

  it("mapeia o ack das mensagens enviadas", () => {
    expect(statusFromAck(4, true)).toBe("READ")
    expect(statusFromAck(3, true)).toBe("DELIVERED")
    expect(statusFromAck(undefined, true)).toBe("SENT")
    expect(statusFromAck(4, false)).toBe("RECEIVED")
  })

  it("converte contatos com LID e telefone", () => {
    expect(
      normalizeContact({
        id: "999@lid",
        phoneNumber: "5511999998888@s.whatsapp.net",
        notify: "João",
      })
    ).toEqual({
      jid: "5511999998888@s.whatsapp.net",
      lid: "999@lid",
      phone: "5511999998888",
      name: undefined,
      pushName: "João",
    })
  })
})

describe("números de WhatsApp do lead", () => {
  it("converte telefones brasileiros para dígitos com DDI", () => {
    expect(toWhatsAppNumber("(11) 99999-8888")).toBe("5511999998888")
    expect(toWhatsAppNumber("(11) 3333-4444")).toBe("551133334444")
    expect(toWhatsAppNumber("+55 11 99999-8888")).toBe("5511999998888")
    expect(toWhatsAppNumber("https://wa.me/5511999998888")).toBe(
      "5511999998888"
    )
    expect(toWhatsAppNumber("+1 415 555 0100")).toBe("14155550100")
    expect(toWhatsAppNumber("99999-8888")).toBeUndefined()
    expect(toWhatsAppNumber("")).toBeUndefined()
  })

  it("ordena os candidatos: link do WhatsApp, telefone, Receita", () => {
    expect(
      leadWhatsAppCandidates({
        phone: "(11) 3333-4444",
        enrichment: { socials: { whatsapp: "5511999998888" } },
        registry: { phones: ["(11) 3333-4444", "(21) 98888-7777"] },
      })
    ).toEqual(["5511999998888", "551133334444", "5521988887777"])
  })
})
