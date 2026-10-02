import { describe, expect, it } from "vitest"

import {
  DEFAULT_SEND_WINDOW,
  ineligibilityReason,
  isWithinWindow,
  jitteredIntervalMs,
  nextWindowStart,
  startOfDay,
  startOfNextDay,
} from "@/domain/campaign"

// São Paulo is UTC-3 all year (no daylight saving).
const sp = (iso: string) => new Date(`${iso}-03:00`)

describe("janela de envio (horário de São Paulo)", () => {
  it("respeita dias úteis e horário comercial", () => {
    // 2026-10-01 is a Thursday.
    expect(isWithinWindow(sp("2026-10-01T09:00:00"), DEFAULT_SEND_WINDOW)).toBe(
      true
    )
    expect(isWithinWindow(sp("2026-10-01T17:59:00"), DEFAULT_SEND_WINDOW)).toBe(
      true
    )
    expect(isWithinWindow(sp("2026-10-01T18:00:00"), DEFAULT_SEND_WINDOW)).toBe(
      false
    )
    expect(isWithinWindow(sp("2026-10-01T08:59:00"), DEFAULT_SEND_WINDOW)).toBe(
      false
    )
    // Saturday
    expect(isWithinWindow(sp("2026-10-03T10:00:00"), DEFAULT_SEND_WINDOW)).toBe(
      false
    )
  })

  it("sexta depois do expediente pula para segunda às 9h", () => {
    const next = nextWindowStart(sp("2026-10-02T18:30:00"), DEFAULT_SEND_WINDOW)
    expect(next?.toISOString()).toBe(sp("2026-10-05T09:00:00").toISOString())
  })

  it("antes do expediente vai para as 9h do mesmo dia", () => {
    const next = nextWindowStart(sp("2026-10-01T07:15:00"), DEFAULT_SEND_WINDOW)
    expect(next?.toISOString()).toBe(sp("2026-10-01T09:00:00").toISOString())
  })

  it("dentro da janela devolve o próprio momento", () => {
    const now = sp("2026-10-01T10:17:00")
    expect(nextWindowStart(now, DEFAULT_SEND_WINDOW)).toBe(now)
  })

  it("janela sem dias nunca abre", () => {
    expect(
      nextWindowStart(sp("2026-10-01T10:00:00"), {
        days: [],
        startHour: 9,
        endHour: 18,
      })
    ).toBeNull()
  })

  it("calcula meia-noite de hoje e de amanhã no fuso de São Paulo", () => {
    const now = sp("2026-10-01T23:30:00")
    expect(startOfDay(now).toISOString()).toBe(
      sp("2026-10-01T00:00:00").toISOString()
    )
    expect(startOfNextDay(now).toISOString()).toBe(
      sp("2026-10-02T00:00:00").toISOString()
    )
  })
})

describe("intervalo com variação", () => {
  it("fica dentro de ±jitter do intervalo", () => {
    const ten = 10 * 60 * 1000
    expect(jitteredIntervalMs(10, 30, () => 0)).toBe(ten * 0.7)
    expect(jitteredIntervalMs(10, 30, () => 1)).toBe(ten * 1.3)
    expect(jitteredIntervalMs(10, 30, () => 0.5)).toBe(ten)
    expect(jitteredIntervalMs(10, 0, () => 0.9)).toBe(ten)
  })
})

describe("elegibilidade", () => {
  const base = { hasPhone: true, hasConversation: false }

  it("aceita lead novo, fora do funil ou em Novo", () => {
    expect(ineligibilityReason({ ...base, stage: null })).toBeNull()
    expect(ineligibilityReason({ ...base, stage: "NEW" })).toBeNull()
  })

  it("recusa quem já foi contatado, já conversou, não tem telefone ou já está em campanha", () => {
    expect(ineligibilityReason({ ...base, stage: "CONTACTED" })).toMatch(
      /contatado/
    )
    expect(ineligibilityReason({ ...base, hasConversation: true })).toMatch(
      /conversa/
    )
    expect(ineligibilityReason({ ...base, hasPhone: false })).toMatch(
      /telefone/
    )
    expect(
      ineligibilityReason({ ...base, openCampaignName: "Padarias SP" })
    ).toMatch(/Padarias SP/)
  })
})
