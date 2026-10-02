import { describe, expect, it } from "vitest"

import { timeZoneForCountries } from "@/domain/campaign"
import {
  analyzePhone,
  countryName,
  leadCountry,
  phoneFields,
} from "@/domain/phone"
import { leadWhatsAppCandidates, toWhatsAppNumber } from "@/domain/whatsapp"

describe("tipo de telefone", () => {
  it.each([
    ["(11) 99999-0001", "BR", "MOBILE", "BR"],
    ["+55 11 99999-0001", undefined, "MOBILE", "BR"],
    ["(11) 3333-4444", "BR", "FIXED_LINE", "BR"],
    ["0800 123 4567", "BR", "OTHER", "BR"],
    ["+351 912 345 678", undefined, "MOBILE", "PT"],
    ["+351 213 456 789", undefined, "FIXED_LINE", "PT"],
    ["912 345 678", "PT", "MOBILE", "PT"],
    ["+54 9 11 1234-5678", undefined, "MOBILE", "AR"],
    ["+1 212 555 0123", undefined, "FIXED_LINE_OR_MOBILE", "US"],
    // The number's own country code wins over the lead's country.
    ["+55 11 99999-0001", "PT", "MOBILE", "BR"],
  ])("%s (%s) é %s de %s", (phone, country, type, phoneCountry) => {
    expect(phoneFields(phone, country)).toEqual({
      phoneType: type,
      phoneCountry,
    })
  })

  it("número inválido fica sem tipo", () => {
    expect(analyzePhone("(11) 9999-0001", "BR")?.type).toBeUndefined()
    expect(phoneFields("", "BR")).toEqual({
      phoneType: undefined,
      phoneCountry: undefined,
    })
  })
})

describe("país do lead", () => {
  it("prefere o endereço e usa o telefone como reserva", () => {
    expect(leadCountry({ address: { country: "PT" } })).toBe("PT")
    expect(
      leadCountry({ phoneCountry: "GG", address: { country: "GB" } })
    ).toBe("GB")
    expect(leadCountry({ phoneCountry: "AR", address: {} })).toBe("AR")
    expect(leadCountry({})).toBe("BR")
  })

  it("nome em português", () => {
    expect(countryName("PT")).toBe("Portugal")
    expect(countryName("BR")).toBe("Brasil")
  })
})

describe("WhatsApp de leads de outros países", () => {
  it("lê o número no país do lead", () => {
    expect(toWhatsAppNumber("912 345 678", "PT")).toBe("351912345678")
    expect(toWhatsAppNumber("(11) 99999-8888")).toBe("5511999998888")
  })

  it("link do WhatsApp estrangeiro mantém o código do país", () => {
    expect(
      leadWhatsAppCandidates({
        phone: "213 456 789",
        address: { country: "PT" },
        enrichment: { socials: { whatsapp: "351912345678" } },
      })
    ).toEqual(["351912345678", "351213456789"])
  })
})

describe("fuso padrão da campanha", () => {
  it("usa o país da maioria dos leads", () => {
    expect(timeZoneForCountries(["PT", "PT", "BR"])).toBe("Europe/Lisbon")
    expect(timeZoneForCountries(["BR"])).toBe("America/Sao_Paulo")
    expect(timeZoneForCountries([])).toBe("America/Sao_Paulo")
    expect(timeZoneForCountries(["ZZ"])).toBe("America/Sao_Paulo")
  })
})
