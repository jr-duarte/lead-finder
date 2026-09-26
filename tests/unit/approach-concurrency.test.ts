import { beforeEach, describe, expect, it, vi } from "vitest"

const business = {
  id: "lead-1",
  externalId: "x",
  source: "google",
  name: "Pizzaria Bella",
  address: {},
  location: {},
  enrichment: { emails: [], socials: {}, technologies: [] },
  status: "NEW",
  searchIds: [],
  collectedAt: new Date(),
  updatedAt: new Date(),
}

const reply = {
  diagnosis: "d",
  hook: "h",
  whatsapp: "w",
  emailSubject: "s",
  emailBody: "b",
  callScript: "c",
  followUp: "f",
  objections: [],
}

let release: () => void = () => {}

vi.mock("@/lib/claude-cli", () => ({
  ClaudeCliError: class extends Error {},
  runClaude: vi.fn(
    () =>
      new Promise((resolve) => {
        release = () => resolve(reply)
      })
  ),
}))

vi.mock("@/repositories/business.repository", () => ({
  businessRepository: {
    findById: vi.fn(async () => business),
    update: vi.fn(async (_id: string, patch: object) => ({
      ...business,
      ...patch,
    })),
  },
}))

vi.mock("@/repositories/note.repository", () => ({
  noteRepository: { listByBusiness: vi.fn(async () => []) },
}))

vi.mock("@/repositories/settings.repository", () => ({
  settingsRepository: {
    getSeller: vi.fn(async () => ({ offer: "Sites para restaurantes" })),
  },
}))

const { approachService } = await import("@/services/approach.service")

describe("approachService.generate em paralelo", () => {
  beforeEach(() => {
    release = () => {}
  })

  it("recusa uma segunda geração para o mesmo lead", async () => {
    const first = approachService.generate("lead-1")

    await expect(approachService.generate("lead-1")).rejects.toMatchObject({
      status: 409,
    })

    // Let the first run reach the CLI before releasing it.
    await new Promise((resolve) => setTimeout(resolve, 0))
    release()
    const result = await first
    expect(result.approach?.hook).toBe("h")
  })

  it("libera o lead depois que a geração termina", async () => {
    const first = approachService.generate("lead-1")
    await new Promise((resolve) => setTimeout(resolve, 0))
    release()
    await first

    const second = approachService.generate("lead-1")
    await new Promise((resolve) => setTimeout(resolve, 0))
    release()
    await expect(second).resolves.toBeDefined()
  })
})
