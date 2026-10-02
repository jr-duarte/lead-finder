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

const runClaude = vi.fn(async () => ({
  diagnosis: "d",
  hook: "h",
  whatsapp: "Oi, vi que vocês não têm site — posso te mostrar uma ideia?",
  emailSubject: "s",
  emailBody: "b",
  callScript: "c",
  followUp: "f",
  objections: [],
}))

vi.mock("@/lib/claude-cli", () => ({
  ClaudeCliError: class extends Error {},
  runClaude: (...args: unknown[]) => runClaude(...(args as [])),
}))

const { BusinessModel } = await import("@/models/business.model")
const { CampaignModel } = await import("@/models/campaign.model")
const { CampaignItemModel } = await import("@/models/campaign-item.model")
const { NoteModel } = await import("@/models/note.model")
const { SettingsModel } = await import("@/models/settings.model")
const { WhatsAppContactModel } = await import("@/models/whatsapp-contact.model")
const { WhatsAppConversationModel } =
  await import("@/models/whatsapp-conversation.model")
const { WhatsAppMessageModel } = await import("@/models/whatsapp-message.model")
const { WhatsAppSessionModel } = await import("@/models/whatsapp-session.model")
const { campaignRepository } =
  await import("@/repositories/campaign.repository")
const { settingsRepository } =
  await import("@/repositories/settings.repository")
const { campaignService } = await import("@/services/campaign/campaign.service")
const { campaignGenerator } = await import("@/services/campaign/generator")
const { recoverInterruptedSends, setSenderRandom, tick } =
  await import("@/services/campaign/sender")
const {
  configureWhatsAppRuntime,
  resetWhatsAppRuntime,
  whatsappSessionService,
} = await import("@/services/whatsapp/session.service")

// São Paulo is UTC-3. 2026-10-08 is a Thursday.
const sp = (iso: string) => new Date(`${iso}-03:00`)
const THURSDAY_10H = sp("2026-10-08T10:00:00")
const minutes = (n: number) => n * 60 * 1000

let database: Awaited<ReturnType<typeof startTestDatabase>>
let sessionDir: string
let client: FakeWhatsAppClient

async function until(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 4000
): Promise<void> {
  const started = Date.now()
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error("timeout")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

let seed = 0
async function seedLead(
  name: string,
  phone: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const doc = await BusinessModel.create({
    name,
    phone,
    source: "manual",
    externalId: `camp-${(seed += 1)}`,
    ...extra,
  })
  return String(doc._id)
}

/** Registers a lead's number as having WhatsApp. */
function hasWhatsApp(digits: string) {
  client.registered.set(digits, `${digits}@s.whatsapp.net`)
}

async function connectWhatsApp() {
  resetWhatsAppRuntime()
  client = new FakeWhatsAppClient()
  configureWhatsAppRuntime({
    factory: () => client,
    settleMs: 10,
    maxSyncMs: 1000,
    reconnectDelayMs: 5,
  })
  await whatsappSessionService.connect()
  client.on.onOpen({ phone: "5511000000000" })
  client.on.onCaughtUp()
  await until(
    async () => (await whatsappSessionService.snapshot()).status === "READY"
  )
}

async function waitForGeneration(campaignId: string) {
  await until(async () => {
    const campaign = await campaignRepository.findById(campaignId)
    return !campaignGenerator.isRunning() && campaign?.status !== "GENERATING"
  })
}

async function items(campaignId: string) {
  return campaignRepository.listItems(campaignId)
}

async function stageOf(businessId: string) {
  const business = await BusinessModel.findById(businessId).lean<{
    pipeline?: { stage?: string }
  }>()
  return business?.pipeline?.stage ?? null
}

/** Creates a campaign with three reachable leads, approved and running. */
async function runningCampaign(count = 3) {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const digits = `551199999000${index}`
    ids.push(await seedLead(`Lead ${index}`, `+${digits}`))
    hasWhatsApp(digits)
  }
  const { campaign } = await campaignService.create({
    name: "Padarias",
    businessIds: ids,
    intervalMinutes: 10,
  })
  await waitForGeneration(campaign.id)
  await campaignService.approveAll(campaign.id)
  await campaignService.start(campaign.id)
  return { campaignId: campaign.id, ids }
}

beforeAll(async () => {
  sessionDir = await mkdtemp(join(tmpdir(), "wa-campaign-"))
  process.env.WHATSAPP_SESSION_DIR = sessionDir
  process.env.WHATSAPP_SESSION_NAME = "campaign-test"
  process.env.WHATSAPP_CAMPAIGN_DAILY_LIMIT = "3"
  process.env.WHATSAPP_CAMPAIGN_JITTER_PERCENT = "30"
  database = await startTestDatabase("campaigns")
  await Promise.all([
    CampaignItemModel.init(),
    WhatsAppMessageModel.init(),
    WhatsAppConversationModel.init(),
  ])
  // Jitter in the middle: every interval is exactly the configured one.
  setSenderRandom(() => 0.5)
}, 120_000)

afterAll(async () => {
  resetWhatsAppRuntime()
  await database.stop()
  await rm(sessionDir, { recursive: true, force: true })
})

beforeEach(async () => {
  runClaude.mockClear()
  await settingsRepository.updateSeller({ offer: "Sites para padarias" })
  await connectWhatsApp()
})

afterEach(async () => {
  await until(() => !campaignGenerator.isRunning())
  resetWhatsAppRuntime()
  await Promise.all(
    [
      BusinessModel,
      CampaignModel,
      CampaignItemModel,
      NoteModel,
      SettingsModel,
      WhatsAppContactModel,
      WhatsAppConversationModel,
      WhatsAppMessageModel,
      WhatsAppSessionModel,
    ].map((model) => (model as typeof BusinessModel).deleteMany({}))
  )
})

describe("criação e geração", () => {
  it("só entram leads novos; abordagens são geradas, revisadas e sem travessão", async () => {
    const fresh = await seedLead("Padaria Nova", "(11) 99999-0001")
    hasWhatsApp("5511999990001")
    const contacted = await seedLead("Já Contatada", "(11) 99999-0002", {
      pipeline: { stage: "CONTACTED", position: 0, enteredAt: new Date() },
    })
    const noPhone = await seedLead("Sem Telefone", "")
    const noWhatsApp = await seedLead("Sem WhatsApp", "(11) 99999-0004")

    const result = await campaignService.create({
      name: "Teste",
      businessIds: [fresh, contacted, noPhone, noWhatsApp],
    })

    expect(result.added).toBe(2)
    expect(result.rejected.map((item) => item.name).sort()).toEqual([
      "Já Contatada",
      "Sem Telefone",
    ])

    await waitForGeneration(result.campaign.id)
    const list = await items(result.campaign.id)
    const byName = new Map(list.map((item) => [item.businessName, item]))

    expect(byName.get("Padaria Nova")?.status).toBe("READY")
    expect(byName.get("Padaria Nova")?.message).toBe(
      "Oi, vi que vocês não têm site, posso te mostrar uma ideia?"
    )
    expect(byName.get("Sem WhatsApp")?.status).toBe("INELIGIBLE")

    const campaign = await campaignRepository.findById(result.campaign.id)
    expect(campaign?.status).toBe("REVIEW")
  })

  it("reaproveita a abordagem já gerada sem chamar o Claude", async () => {
    const id = await seedLead("Com Abordagem", "(11) 99999-0001", {
      approach: {
        generatedAt: new Date(),
        whatsapp: "Mensagem pronta",
        objections: [],
      },
    })
    hasWhatsApp("5511999990001")

    const { campaign } = await campaignService.create({
      name: "Reuso",
      businessIds: [id],
    })
    await waitForGeneration(campaign.id)

    expect(runClaude).not.toHaveBeenCalled()
    expect((await items(campaign.id))[0]?.message).toBe("Mensagem pronta")
  })

  it("tira a assinatura de uma abordagem antiga reaproveitada", async () => {
    await settingsRepository.updateSeller({
      offer: "Sites para padarias",
      sellerName: "Junior Duarte",
    })
    const id = await seedLead("Assinada", "(11) 99999-0001", {
      approach: {
        generatedAt: new Date(),
        whatsapp: "Oi, posso te mostrar uma ideia?\n\nAbraço,\nJunior Duarte",
        objections: [],
      },
    })
    hasWhatsApp("5511999990001")

    const { campaign } = await campaignService.create({
      name: "Sem assinatura",
      businessIds: [id],
    })
    await waitForGeneration(campaign.id)

    expect((await items(campaign.id))[0]?.message).toBe(
      "Oi, posso te mostrar uma ideia?"
    )
  })

  it("ao subir, limpa assinaturas já salvas sem tocar no que foi enviado", async () => {
    const id = await seedLead("Antiga", "(11) 99999-0001", {
      approach: {
        generatedAt: new Date(),
        whatsapp: "Oi, tudo bem?\nJunior Duarte",
        followUp: "E aí, conseguiu ver?\n\nJunior",
        objections: [],
      },
    })
    hasWhatsApp("5511999990001")
    const { campaign } = await campaignService.create({
      name: "Antiga",
      businessIds: [id],
    })
    await waitForGeneration(campaign.id)
    const [item] = await items(campaign.id)
    // Simulates messages written before the fix.
    await CampaignItemModel.updateOne(
      { _id: item.id },
      { $set: { message: "Oi, tudo bem?\nJunior Duarte" } }
    )
    await BusinessModel.updateOne(
      { _id: id },
      { $set: { "approach.whatsapp": "Oi, tudo bem?\nJunior Duarte" } }
    )
    await settingsRepository.updateSeller({
      offer: "Sites para padarias",
      sellerName: "Junior Duarte",
    })

    await campaignService.boot()

    expect((await items(campaign.id))[0]?.message).toBe("Oi, tudo bem?")
    const business = await BusinessModel.findById(id).lean<{
      approach?: { whatsapp?: string; followUp?: string }
    }>()
    expect(business?.approach?.whatsapp).toBe("Oi, tudo bem?")
    expect(business?.approach?.followUp).toBe("E aí, conseguiu ver?")
  })

  it("exige a oferta configurada", async () => {
    await settingsRepository.updateSeller({ offer: "" })
    const id = await seedLead("X", "(11) 99999-0001")
    await expect(
      campaignService.create({ name: "Sem oferta", businessIds: [id] })
    ).rejects.toMatchObject({ status: 422 })
  })

  it("um lead não entra em duas campanhas abertas", async () => {
    const id = await seedLead("Disputada", "(11) 99999-0001")
    hasWhatsApp("5511999990001")
    const first = await campaignService.create({ name: "A", businessIds: [id] })
    await waitForGeneration(first.campaign.id)

    await expect(
      campaignService.create({ name: "B", businessIds: [id] })
    ).rejects.toMatchObject({ status: 422 })

    const other = await campaignService.create({ name: "C", businessIds: [] })
    const added = await campaignService.addLeads(other.campaign.id, [id])
    expect(added.added).toBe(0)
    expect(added.rejected[0]?.reason).toMatch(/"A"/)
  })
})

describe("fila de envio", () => {
  it("envia um por vez, respeitando o intervalo, e move o lead para Contatado", async () => {
    const { campaignId, ids } = await runningCampaign()

    await tick(THURSDAY_10H)
    expect(client.sent).toHaveLength(1)
    expect(await stageOf(ids[0])).toBe("CONTACTED")

    // Same moment, and 9 minutes later: still waiting for the interval.
    await tick(THURSDAY_10H)
    await tick(new Date(THURSDAY_10H.getTime() + minutes(9)))
    expect(client.sent).toHaveLength(1)

    await tick(new Date(THURSDAY_10H.getTime() + minutes(10)))
    expect(client.sent).toHaveLength(2)

    const list = await items(campaignId)
    expect(list.filter((item) => item.status === "SENT")).toHaveLength(2)
    expect(list[0]?.conversationId).toBeTruthy()
  })

  it("depois de horas com o CRM fechado, envia só um e volta ao ritmo", async () => {
    await runningCampaign()
    await tick(THURSDAY_10H)

    const later = new Date(THURSDAY_10H.getTime() + minutes(5 * 60))
    await tick(later)
    await tick(later)
    await tick(new Date(later.getTime() + minutes(1)))
    expect(client.sent).toHaveLength(2)
  })

  it("respeita o limite diário somando todas as campanhas", async () => {
    const { campaignId } = await runningCampaign(5)
    for (let step = 0; step < 5; step += 1) {
      await tick(new Date(THURSDAY_10H.getTime() + minutes(10 * step)))
    }
    expect(client.sent).toHaveLength(3)

    const campaign = await campaignRepository.findById(campaignId)
    expect(campaign?.waitReason).toMatch(/Limite diário de 3/)
    expect(campaign?.nextSendAt?.toISOString()).toBe(
      sp("2026-10-09T09:00:00").toISOString()
    )

    // Next day, inside the window, the queue goes on.
    await tick(sp("2026-10-09T09:00:00"))
    expect(client.sent).toHaveLength(4)
  })

  it("fora do horário espera a próxima janela", async () => {
    const { campaignId } = await runningCampaign()
    // Saturday
    await tick(sp("2026-10-10T11:00:00"))
    expect(client.sent).toHaveLength(0)

    const campaign = await campaignRepository.findById(campaignId)
    expect(campaign?.waitReason).toMatch(/Fora do horário/)
    expect(campaign?.nextSendAt?.toISOString()).toBe(
      sp("2026-10-12T09:00:00").toISOString()
    )
  })

  it("pausa todas as campanhas quando o WhatsApp restringe a conta", async () => {
    const { campaignId } = await runningCampaign()
    client.outreach = { restricted: true }

    await tick(THURSDAY_10H)
    expect(client.sent).toHaveLength(0)

    const campaign = await campaignRepository.findById(campaignId)
    expect(campaign?.status).toBe("PAUSED")
    expect(campaign?.pauseReason).toMatch(/limitando novos contatos/)
  })

  it("pausa depois de 3 falhas seguidas", async () => {
    const { campaignId } = await runningCampaign(4)
    client.failSends = 3
    for (let step = 0; step < 3; step += 1) {
      await tick(new Date(THURSDAY_10H.getTime() + minutes(10 * step)))
    }

    const campaign = await campaignRepository.findById(campaignId)
    expect(campaign?.status).toBe("PAUSED")
    expect(campaign?.pauseReason).toMatch(/3 falhas seguidas/)
    expect(
      (await items(campaignId)).filter((item) => item.status === "FAILED")
    ).toHaveLength(3)
  })

  it("nunca manda duas vezes, nem com ticks simultâneos", async () => {
    await runningCampaign(1)
    await Promise.all([
      tick(THURSDAY_10H),
      tick(THURSDAY_10H),
      tick(THURSDAY_10H),
    ])
    await tick(new Date(THURSDAY_10H.getTime() + minutes(60)))
    expect(client.sent).toHaveLength(1)
  })

  it("pula quem foi contatado por fora antes da vez", async () => {
    const { campaignId, ids } = await runningCampaign(2)
    await BusinessModel.updateOne(
      { _id: ids[0] },
      { pipeline: { stage: "MEETING", position: 0, enteredAt: new Date() } }
    )

    await tick(THURSDAY_10H)
    const list = await items(campaignId)
    expect(list[0]?.status).toBe("SKIPPED")
    expect(list[0]?.reason).toMatch(/contatado/)
    expect(client.sent).toHaveLength(0)

    // The skipped lead used no slot: the next one goes on the next tick.
    await tick(new Date(THURSDAY_10H.getTime() + minutes(1)))
    expect(client.sent).toHaveLength(1)
  })

  it("termina a campanha quando a fila esvazia", async () => {
    const { campaignId } = await runningCampaign(1)
    await tick(THURSDAY_10H)
    await tick(new Date(THURSDAY_10H.getTime() + minutes(10)))

    const campaign = await campaignRepository.findById(campaignId)
    expect(campaign?.status).toBe("DONE")
  })

  it("não envia sem WhatsApp conectado", async () => {
    await runningCampaign(1)
    await whatsappSessionService.disconnect()
    await tick(THURSDAY_10H)
    expect(client.sent).toHaveLength(0)
  })
})

describe("pular e desfazer", () => {
  async function campaignWithOne() {
    const id = await seedLead("Lead Pulado", "(11) 99999-0001")
    hasWhatsApp("5511999990001")
    const { campaign } = await campaignService.create({
      name: "Desfazer",
      businessIds: [id],
    })
    await waitForGeneration(campaign.id)
    const [item] = await items(campaign.id)
    return { businessId: id, campaignId: campaign.id, itemId: item.id }
  }

  it("um lead pulado volta para aprovação com a mesma mensagem", async () => {
    const { campaignId, itemId } = await campaignWithOne()
    const before = (await items(campaignId))[0]?.message

    await campaignService.updateItem(campaignId, itemId, { status: "SKIPPED" })
    expect((await items(campaignId))[0]?.status).toBe("SKIPPED")

    const restored = await campaignService.restoreItem(campaignId, itemId)
    expect(restored.status).toBe("READY")
    expect(restored.message).toBe(before)
  })

  it("sem mensagem, volta para a fila de geração", async () => {
    const { campaignId, itemId } = await campaignWithOne()
    await CampaignItemModel.updateOne(
      { _id: itemId },
      { $set: { status: "SKIPPED" }, $unset: { message: 1 } }
    )

    await campaignService.restoreItem(campaignId, itemId)
    await until(async () => (await items(campaignId))[0]?.status === "READY")
  })

  it("não volta se o lead foi contatado ou entrou em outra campanha", async () => {
    const { businessId, campaignId, itemId } = await campaignWithOne()
    await campaignService.updateItem(campaignId, itemId, { status: "SKIPPED" })

    // Released by the skip, the lead joins another campaign...
    const other = await campaignService.create({
      name: "Outra",
      businessIds: [businessId],
    })
    expect(other.added).toBe(1)
    await expect(
      campaignService.restoreItem(campaignId, itemId)
    ).rejects.toMatchObject({ status: 409, message: /"Outra"/ })

    // ...or gets contacted by hand.
    await campaignService.cancel(other.campaign.id)
    await BusinessModel.updateOne(
      { _id: businessId },
      { pipeline: { stage: "CONTACTED", position: 0, enteredAt: new Date() } }
    )
    await expect(
      campaignService.restoreItem(campaignId, itemId)
    ).rejects.toMatchObject({ status: 409, message: /contatado/ })
  })

  it("só desfaz itens pulados", async () => {
    const { campaignId, itemId } = await campaignWithOne()
    await expect(
      campaignService.restoreItem(campaignId, itemId)
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe("respostas, cancelamento e recuperação", () => {
  it("resposta do lead marca o item como Respondeu", async () => {
    const { campaignId } = await runningCampaign(1)
    await tick(THURSDAY_10H)

    client.on.onBatch(
      {
        chats: [],
        contacts: [],
        messages: [
          {
            id: "reply-1",
            chatJid: "5511999990000@s.whatsapp.net",
            fromMe: false,
            from: "5511999990000@s.whatsapp.net",
            to: "me",
            body: "Oi! Tenho interesse",
            type: "text",
            timestamp: new Date(),
            status: "RECEIVED",
          },
        ],
      },
      "live"
    )

    await until(async () => (await items(campaignId))[0]?.status === "REPLIED")
  })

  it("cancelar libera os leads que não foram contatados", async () => {
    const { campaignId, ids } = await runningCampaign(2)
    await tick(THURSDAY_10H)
    await campaignService.cancel(campaignId)

    const list = await items(campaignId)
    expect(list.map((item) => item.status)).toEqual(["SENT", "SKIPPED"])

    // The released lead can join a new campaign.
    const again = await campaignService.create({
      name: "Nova",
      businessIds: [ids[1]],
    })
    expect(again.added).toBe(1)
  })

  it("após reinício, envio interrompido vira enviado se a mensagem existe; senão pede revisão", async () => {
    const { campaignId } = await runningCampaign(2)
    await tick(THURSDAY_10H)

    const [sent, waiting] = await items(campaignId)
    // Simulates a crash: both items left in SENDING.
    await CampaignItemModel.updateMany(
      { _id: { $in: [sent.id, waiting.id] } },
      { $set: { status: "SENDING" }, $unset: { sentAt: 1 } }
    )

    await recoverInterruptedSends()
    const list = await items(campaignId)
    expect(list[0]?.status).toBe("SENT")
    expect(list[1]?.status).toBe("FAILED")
    expect(list[1]?.reason).toMatch(/interrompido/)
  })
})
