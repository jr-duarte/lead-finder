import { access, rm } from "node:fs/promises"
import { join, resolve } from "node:path"

import QRCode from "qrcode"

import {
  isWhatsAppOnline,
  leadWhatsAppCandidates,
  toWhatsAppNumber,
  type WhatsAppConversation,
  type WhatsAppMessage,
  type WhatsAppStatus,
  type WhatsAppSyncStats,
} from "@/domain/whatsapp"
import { getEnv } from "@/lib/env"
import { getMediaStorage } from "@/lib/storage/media-storage"
import type {
  WaBatch,
  WaBatchSource,
  WaClientHandlers,
  WaCloseReason,
  WaMessage,
  WaOutgoingMedia,
  WaOutreachStatus,
  WaQuote,
  WhatsAppClient,
  WhatsAppClientFactory,
} from "@/lib/whatsapp/client"
import { businessRepository } from "@/repositories/business.repository"
import { campaignRepository } from "@/repositories/campaign.repository"
import { followUpRepository } from "@/repositories/follow-up.repository"
import { whatsappConversationRepository } from "@/repositories/whatsapp-conversation.repository"
import { whatsappMessageRepository } from "@/repositories/whatsapp-message.repository"
import { whatsappSessionRepository } from "@/repositories/whatsapp-session.repository"
import { autoReplyClassifier } from "@/services/follow-up/auto-reply"
import { followUpWatch } from "@/services/follow-up/watch"
import { emitWhatsAppEvent } from "@/services/whatsapp/events"
import {
  ingestBatch,
  type IngestResult,
} from "@/services/whatsapp/ingest.service"
import { findLeadByPhone } from "@/services/whatsapp/lead-matcher"
import { storeMedia } from "@/services/whatsapp/media.service"
import { advanceLeadStages } from "@/services/whatsapp/pipeline-automation"

/**
 * Owns the one WhatsApp connection of this server process: connect, QR code,
 * reconnect, logout, and the sync that runs every time the connection opens.
 *
 * There is no 24/7 worker. Messages that arrive while the CRM is closed are
 * held by WhatsApp and delivered when the next connection opens, and the sync
 * below persists them.
 */

/** After WhatsApp says it caught up, wait this long without new data. */
const SETTLE_MS = 3_000
/** A sync never stays open longer than this, even without that signal. */
const MAX_SYNC_MS = 120_000
const MAX_RECONNECT_ATTEMPTS = 8

type ActiveSync = {
  stats: WhatsAppSyncStats
  conversations: Set<string>
  /** WhatsApp finished delivering what was pending. */
  caughtUp: boolean
  /** History sync progress reported by WhatsApp, when it reports it. */
  progress: number | null
  error?: string
  settleTimer?: ReturnType<typeof setTimeout>
  maxTimer?: ReturnType<typeof setTimeout>
}

type Runtime = {
  status: WhatsAppStatus
  qr?: string
  phone?: string
  pushName?: string
  error?: string
  client: WhatsAppClient | null
  sync: ActiveSync | null
  /** History older than this is not imported. */
  historySince?: Date
  /** Batches are persisted one at a time, in arrival order. */
  queue: Promise<unknown>
  pending: number
  reconnectAttempts: number
  reconnectTimer?: ReturnType<typeof setTimeout>
  /** Set while we close the socket on purpose. */
  stopping: boolean
  /** LID → phone jid pairs already merged in this process. */
  lidMappings?: Map<string, string>
  /** CLIENT_API_VERSION of the code that created `client`. */
  clientVersion?: number
  /** Present while a stale client is being replaced. */
  swapping?: Promise<void>
}

/**
 * Bump whenever the WhatsAppClient interface changes. The runtime survives
 * dev hot reloads, so without this a client built by older code (missing a
 * new method) would stay in use until the server restarts.
 */
const CLIENT_API_VERSION = 6

// Shared across hot reloads and across the instrumentation/route bundles, so
// there is never more than one socket for the session.
const globalForWhatsApp = globalThis as typeof globalThis & {
  __leadFinderWhatsApp?: Runtime
}

const runtime: Runtime = globalForWhatsApp.__leadFinderWhatsApp ?? {
  status: "DISCONNECTED",
  client: null,
  sync: null,
  queue: Promise.resolve(),
  pending: 0,
  reconnectAttempts: 0,
  stopping: false,
}
globalForWhatsApp.__leadFinderWhatsApp = runtime

type Overrides = {
  factory?: WhatsAppClientFactory
  settleMs?: number
  maxSyncMs?: number
  reconnectDelayMs?: number
}

let overrides: Overrides = {}

/** Test seam: swaps the WhatsApp client and shortens the timers. */
export function configureWhatsAppRuntime(next: Overrides): void {
  overrides = next
}

/** Test seam: forgets all in-memory state. */
export function resetWhatsAppRuntime(): void {
  clearTimers()
  Object.assign(runtime, {
    status: "DISCONNECTED",
    qr: undefined,
    phone: undefined,
    pushName: undefined,
    error: undefined,
    client: null,
    sync: null,
    historySince: undefined,
    queue: Promise.resolve(),
    pending: 0,
    reconnectAttempts: 0,
    stopping: false,
    clientVersion: undefined,
    swapping: undefined,
    lidMappings: undefined,
  } satisfies Runtime)
}

function settings() {
  const env = getEnv()
  return {
    enabled: env.WHATSAPP_ENABLED,
    sessionName: env.WHATSAPP_SESSION_NAME,
    authDir: resolve(env.WHATSAPP_SESSION_DIR, env.WHATSAPP_SESSION_NAME),
    includeGroups: env.WHATSAPP_INCLUDE_GROUPS,
    initialSyncDays: env.WHATSAPP_INITIAL_SYNC_DAYS,
    safetyWindowMin: env.WHATSAPP_SYNC_SAFETY_WINDOW_MIN,
  }
}

function log(message: string, ...details: unknown[]) {
  console.info(`[whatsapp] ${message}`, ...details)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function clearTimers() {
  if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer)
  runtime.reconnectTimer = undefined
  if (runtime.sync?.settleTimer) clearTimeout(runtime.sync.settleTimer)
  if (runtime.sync?.maxTimer) clearTimeout(runtime.sync.maxTimer)
}

function persist(
  patch: Parameters<typeof whatsappSessionRepository.update>[1]
) {
  void whatsappSessionRepository
    .update(settings().sessionName, patch)
    .catch((error) => console.error("[whatsapp] falha ao salvar sessão", error))
}

function setStatus(status: WhatsAppStatus, error?: string) {
  runtime.status = status
  runtime.error = error
  if (status !== "QR_REQUIRED") runtime.qr = undefined
  emitWhatsAppEvent({ type: "status", status })
  persist({ status })
}

/** Runs persistence work strictly in order, surviving earlier failures. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  runtime.pending += 1
  const run = runtime.queue.then(task, task)
  runtime.queue = run.catch(() => undefined)
  return run.finally(() => {
    runtime.pending -= 1
  })
}

/**
 * Queues work whose failure must fail the running sync. The error is recorded
 * inside the task, before the queue moves on, so a sync finishing right after
 * can never miss it and report success.
 */
function enqueueSyncWork(
  task: () => Promise<void>,
  failure: string,
  target: () => ActiveSync | null = () => runtime.sync
): void {
  void enqueue(async () => {
    try {
      await task()
    } catch (error) {
      console.error(`[whatsapp] ${failure}`, error)
      const sync = target()
      if (sync) sync.error = errorMessage(error, failure)
    }
  })
}

async function waitForQueue(): Promise<void> {
  while (runtime.pending > 0) await runtime.queue
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * The window a sync imports history from: the previous sync minus a safety
 * overlap, or the initial window on the very first connection. The overlap
 * costs nothing — known message ids are skipped.
 */
async function computeHistorySince(): Promise<Date> {
  const { sessionName, initialSyncDays, safetyWindowMin } = settings()
  const session = await whatsappSessionRepository.get(sessionName)
  const initial = Date.now() - initialSyncDays * 24 * 60 * 60 * 1000

  if (!session?.lastSyncAt) return new Date(initial)
  // Never reach further back than the initial window.
  return new Date(
    Math.max(initial, session.lastSyncAt.getTime() - safetyWindowMin * 60_000)
  )
}

function beginSync(trigger: "connect" | "manual"): void {
  if (runtime.sync) return

  const sync: ActiveSync = {
    stats: { startedAt: new Date(), conversations: 0, newMessages: 0 },
    conversations: new Set(),
    // A manual sync has nothing pending to wait for.
    caughtUp: trigger === "manual",
    progress: null,
  }
  runtime.sync = sync
  setStatus("SYNCING")

  // First in the queue, so no batch is persisted before the window is known.
  enqueueSyncWork(
    async () => {
      runtime.historySince = await computeHistorySince()
      log(
        `sincronização iniciada (${trigger === "manual" ? "manual" : "ao conectar"}), histórico desde ${runtime.historySince.toISOString()}`
      )
    },
    "Falha ao ler a última sincronização.",
    () => sync
  )

  if (trigger === "manual") {
    enqueueSyncWork(reconcile, "Falha ao reconciliar conversas.", () => sync)
  }

  sync.maxTimer = setTimeout(
    () => void finishSync(),
    overrides.maxSyncMs ?? MAX_SYNC_MS
  )
  scheduleSettle()
}

/**
 * Work a manual sync can do without new data from WhatsApp: recompute every
 * preview from stored messages and try to link leads registered since.
 */
async function reconcile(): Promise<void> {
  const sync = runtime.sync
  let page = 1
  for (;;) {
    const { items, totalPages } = await whatsappConversationRepository.list({
      page,
      pageSize: 100,
    })
    for (const conversation of items) {
      await whatsappConversationRepository.refreshSummary(conversation.id)
      if (
        !conversation.businessId &&
        conversation.leadLinkSource !== "manual"
      ) {
        const businessId = await findLeadByPhone(conversation.phone)
        if (businessId) {
          await whatsappConversationRepository.setLead(
            conversation.id,
            businessId,
            "auto"
          )
          sync?.conversations.add(conversation.id)
        }
      }
    }
    if (page >= totalPages) break
    page += 1
  }
}

/** Finishes the sync once WhatsApp caught up and data stopped flowing. */
function scheduleSettle() {
  const sync = runtime.sync
  if (!sync || !sync.caughtUp) return
  if (sync.settleTimer) clearTimeout(sync.settleTimer)
  sync.settleTimer = setTimeout(
    () => void finishSync(),
    overrides.settleMs ?? SETTLE_MS
  )
}

async function finishSync(): Promise<void> {
  const sync = runtime.sync
  if (!sync) return
  if (sync.settleTimer) clearTimeout(sync.settleTimer)
  if (sync.maxTimer) clearTimeout(sync.maxTimer)

  await waitForQueue()
  if (runtime.sync !== sync) return
  runtime.sync = null

  sync.stats.finishedAt = new Date()
  sync.stats.conversations = sync.conversations.size
  const seconds = (
    (sync.stats.finishedAt.getTime() - sync.stats.startedAt.getTime()) /
    1000
  ).toFixed(1)
  const { sessionName } = settings()

  try {
    if (sync.error) {
      // The bookmark stays put, so the next sync covers this window again.
      await whatsappSessionRepository.update(sessionName, {
        lastSyncError: sync.error,
      })
      log(`sincronização terminou com erro após ${seconds}s: ${sync.error}`)
    } else {
      await whatsappSessionRepository.recordSync(sessionName, sync.stats)
      log(
        `sincronização concluída em ${seconds}s: ${sync.stats.conversations} conversas, ${sync.stats.newMessages} mensagens novas`
      )
    }
  } catch (error) {
    console.error("[whatsapp] falha ao registrar a sincronização", error)
  }

  // Leftovers of chats WhatsApp named only by LID, now or in older syncs.
  const removed = await enqueue(() =>
    whatsappConversationRepository.removeEmptyLidConversations()
  ).catch((error) => {
    console.error("[whatsapp] falha ao limpar conversas duplicadas", error)
    return 0
  })
  if (removed > 0) {
    log(`${removed} conversa(s) vazia(s) duplicada(s) por LID removida(s)`)
    emitWhatsAppEvent({ type: "conversations", conversationIds: [] })
  }

  if (isWhatsAppOnline(runtime.status)) setStatus("READY")
  if (sync.conversations.size > 0) {
    emitWhatsAppEvent({
      type: "conversations",
      conversationIds: [...sync.conversations],
    })
  }
}

function abortSync(reason: string) {
  const sync = runtime.sync
  if (!sync) return
  if (sync.settleTimer) clearTimeout(sync.settleTimer)
  if (sync.maxTimer) clearTimeout(sync.maxTimer)
  runtime.sync = null
  log(`sincronização interrompida: ${reason}`)
}

/** A lead that answers counts as a reply on its campaign. */
async function markCampaignReplies(conversationIds: string[]): Promise<void> {
  const businessIds = new Set<string>()
  for (const id of conversationIds) {
    const conversation = await whatsappConversationRepository.findById(id)
    if (conversation?.businessId) businessIds.add(conversation.businessId)
  }
  if (businessIds.size > 0) {
    await campaignRepository.markReplied([...businessIds])
  }
}

/**
 * Moves linked leads along the board after new messages. A failure here is
 * logged and never undoes the messages already stored.
 */
async function applyPipelineAutomation(result: IngestResult): Promise<void> {
  try {
    // Automatic replies (greetings, away messages) are not answers: the
    // lead stays in "Contatado" and still gets its follow-up.
    const answered = await autoReplyClassifier.classifyReplies(
      result.repliedConversationIds,
      result.incomingMessageIds
    )
    await markCampaignReplies(answered)
    const changes = await advanceLeadStages({
      contactedConversationIds: result.contactedConversationIds,
      repliedConversationIds: answered,
    })
    // An answer or a message typed by hand cancels a follow-up not sent yet.
    await followUpWatch.check([
      ...result.repliedConversationIds,
      ...result.contactedConversationIds,
    ])
    for (const change of changes) {
      log(
        `lead ${change.businessId} movido para ${change.to}${change.from ? ` (era ${change.from})` : " (entrou no funil)"}`
      )
    }
    if (changes.length > 0) {
      emitWhatsAppEvent({
        type: "leads",
        businessIds: changes.map((change) => change.businessId),
      })
    }
  } catch (error) {
    console.error("[whatsapp] falha ao atualizar o funil", error)
  }
}

/**
 * Fetches the files of new messages in the background: a slow download must
 * not hold up the sync, and the chat refreshes when each batch lands.
 */
function storeMediaInBackground(result: IngestResult) {
  if (result.media.length === 0) return
  void storeMedia(result.media)
    .then((conversationIds) => {
      if (conversationIds.length > 0) {
        emitWhatsAppEvent({ type: "conversations", conversationIds })
      }
    })
    .catch((error) => console.error("[whatsapp] falha ao salvar mídias", error))
}

function handleBatch(batch: WaBatch, source: WaBatchSource) {
  enqueueSyncWork(async () => {
    const result = await ingestBatch(batch, source, {
      historySince: runtime.historySince,
    })
    // History is the past: only fresh activity moves leads on the board.
    if (source !== "history") await applyPipelineAutomation(result)
    storeMediaInBackground(result)

    const sync = runtime.sync
    if (sync) {
      sync.stats.newMessages += result.newMessages
      for (const id of result.conversationIds) sync.conversations.add(id)
    }
    if (result.newMessages > 0 && source !== "history") {
      log(`${result.newMessages} mensagem(ns) nova(s) (${source})`)
    }
    if (result.conversationIds.length > 0) {
      emitWhatsAppEvent({
        type: "conversations",
        conversationIds: result.conversationIds,
      })
    }
  }, "Falha ao salvar mensagens.")
  // Fresh data restarts the quiet period.
  scheduleSettle()
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

function scheduleReconnect(reason?: string) {
  runtime.reconnectAttempts += 1
  if (runtime.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    log("desisti de reconectar após várias tentativas")
    runtime.client = null
    setStatus(
      "ERROR",
      "Não foi possível reconectar ao WhatsApp. Verifique a internet e clique em Conectar."
    )
    return
  }

  const base = overrides.reconnectDelayMs ?? 1_000
  const delay = Math.min(30_000, base * 2 ** (runtime.reconnectAttempts - 1))
  log(
    `conexão caiu${reason ? ` (${reason})` : ""}; reconectando em ${Math.round(delay / 1000)}s (tentativa ${runtime.reconnectAttempts})`
  )
  setStatus("RECONNECTING")
  runtime.reconnectTimer = setTimeout(() => {
    runtime.reconnectTimer = undefined
    void startClient()
  }, delay)
}

function handleClose(reason: WaCloseReason) {
  if (runtime.stopping) return
  abortSync("conexão encerrada")

  if (reason.loggedOut) {
    log("sessão encerrada pelo celular; será preciso ler o QR Code de novo")
    runtime.client = null
    runtime.phone = undefined
    void rm(settings().authDir, { recursive: true, force: true }).catch(
      () => undefined
    )
    setStatus(
      "LOGGED_OUT",
      "O WhatsApp foi desconectado pelo celular. Conecte novamente."
    )
    return
  }

  if (reason.qrExpired) {
    log("QR Code expirou sem ser lido")
    runtime.client = null
    setStatus(
      "DISCONNECTED",
      "O QR Code expirou. Clique em Conectar para gerar outro."
    )
    return
  }

  if (reason.replaced) {
    log("sessão aberta em outro processo; esta conexão foi encerrada")
    runtime.client = null
    setStatus(
      "ERROR",
      "A sessão foi aberta em outro lugar. Feche a outra instância e conecte novamente."
    )
    return
  }

  // Expected right after pairing: WhatsApp asks for a fresh socket.
  if (reason.restartRequired) {
    log("reiniciando a conexão a pedido do WhatsApp")
    void startClient()
    return
  }

  scheduleReconnect(reason.message)
}

function handlers(): WaClientHandlers {
  return {
    onQr: (qr) => {
      void QRCode.toDataURL(qr, { margin: 1, width: 280 }).then((dataUrl) => {
        runtime.qr = dataUrl
        log("QR Code gerado; aguardando leitura")
        setStatus("QR_REQUIRED")
      })
    },
    onOpen: (me) => {
      runtime.reconnectAttempts = 0
      runtime.phone = me.phone
      runtime.pushName = me.pushName
      log(`conectado${me.phone ? ` como +${me.phone}` : ""}`)
      setStatus("CONNECTED")
      persist({
        phoneNumber: me.phone,
        pushName: me.pushName,
        lastConnectedAt: new Date(),
      })
      beginSync("connect")
    },
    onClose: handleClose,
    onCaughtUp: () => {
      if (!runtime.sync) return
      runtime.sync.caughtUp = true
      scheduleSettle()
    },
    onHistoryProgress: (progress) => {
      if (!runtime.sync) return
      runtime.sync.progress = Math.max(0, Math.min(100, progress))
      emitWhatsAppEvent({ type: "status", status: runtime.status })
    },
    onBatch: handleBatch,
    onMessageStatus: (updates) => {
      void enqueue(() => whatsappMessageRepository.updateStatuses(updates))
        .then((changed) => {
          if (changed > 0) emitWhatsAppEvent({ type: "message-status" })
        })
        .catch((error) =>
          console.error("[whatsapp] falha ao atualizar status", error)
        )
    },
    onLidMapping: ({ lid, pnJid }) => {
      // Every message by LID repeats its mapping; merging once is enough.
      if (runtime.lidMappings?.get(lid) === pnJid) return
      runtime.lidMappings ??= new Map()
      runtime.lidMappings.set(lid, pnJid)
      void enqueue(() =>
        whatsappConversationRepository.mergeLid(
          lid,
          pnJid,
          /^(\d+)@/.exec(pnJid)?.[1]
        )
      )
        .then((merged) => {
          if (merged) {
            emitWhatsAppEvent({ type: "conversations", conversationIds: [] })
          }
        })
        .catch((error) =>
          console.error("[whatsapp] falha ao unificar contato", error)
        )
    },
  }
}

async function defaultFactory(): Promise<WhatsAppClientFactory> {
  // Loaded lazily so tests and pages that never connect skip Baileys.
  const { createBaileysClient } = await import("@/lib/whatsapp/baileys-client")
  return createBaileysClient
}

async function startClient(): Promise<void> {
  const config = settings()
  if (!runtime.client) {
    const factory = overrides.factory ?? (await defaultFactory())
    runtime.client = factory({
      authDir: config.authDir,
      includeGroups: config.includeGroups,
      getStoredMessage: async (id) => {
        const message = await whatsappMessageRepository.findByWhatsAppId(id)
        // Only texts can be rebuilt from what is stored.
        return message?.fromMe && message.type === "text"
          ? message.body
          : undefined
      },
    })
    runtime.clientVersion = CLIENT_API_VERSION
  }

  if (runtime.status !== "RECONNECTING") setStatus("INITIALIZING")
  log(`iniciando sessão "${config.sessionName}"`)

  try {
    await runtime.client.start(handlers())
  } catch (error) {
    console.error("[whatsapp] não foi possível iniciar", error)
    runtime.client = null
    setStatus(
      "ERROR",
      errorMessage(error, "Não foi possível iniciar o WhatsApp.")
    )
  }
}

/**
 * The shared path of every send: checks the connection, sends, and stores
 * the message right away without waiting for WhatsApp's echo.
 */
async function deliver(
  conversationId: string,
  send: (
    client: WhatsAppClient,
    chatJid: string,
    quoted: WaQuote | undefined
  ) => Promise<WaMessage>,
  options: { awaitMedia?: boolean; replyTo?: string } = {}
): Promise<WhatsAppMessage> {
  const conversation =
    await whatsappConversationRepository.findById(conversationId)
  if (!conversation)
    throw new WhatsAppActionError("Conversa não encontrada.", 404)

  let quoted: WaQuote | undefined
  if (options.replyTo) {
    const original = await whatsappMessageRepository.findById(options.replyTo)
    if (!original || original.conversationId !== conversation.id) {
      throw new WhatsAppActionError(
        "A mensagem respondida não está nesta conversa.",
        422
      )
    }
    quoted = {
      id: original.whatsappMessageId,
      fromMe: original.fromMe,
      type: original.type,
      body: original.body,
    }
  }

  await refreshStaleClient()
  const client = runtime.client
  if (!client || !isWhatsAppOnline(runtime.status)) {
    throw new WhatsAppActionError(
      "O WhatsApp não está conectado. Conecte para enviar mensagens.",
      409
    )
  }

  let sent: WaMessage
  try {
    sent = await send(client, conversation.whatsappChatId, quoted)
  } catch (error) {
    console.error("[whatsapp] falha ao enviar mensagem", error)
    throw new WhatsAppActionError(
      errorMessage(error, "Não foi possível enviar a mensagem."),
      502
    )
  }

  // The same message also comes back as an event; the unique id makes the
  // second write a no-op.
  const result = await enqueue(async () => {
    const ingested = await ingestBatch(
      { chats: [], contacts: [], messages: [sent] },
      "live"
    )
    await applyPipelineAutomation(ingested)
    return ingested
  })
  if (options.awaitMedia) await storeMedia(result.media)
  else storeMediaInBackground(result)

  // Replying means the conversation was read.
  await whatsappConversationRepository.markRead(conversation.id)
  log(`mensagem enviada (conversa ${conversation.id})`)
  emitWhatsAppEvent({ type: "message", conversationId: conversation.id })

  const stored = await whatsappMessageRepository.findByWhatsAppId(sent.id)
  if (!stored)
    throw new WhatsAppActionError("Mensagem enviada, mas não foi salva.", 500)
  return stored
}

/** Waits while a (re)connection is still being set up. */
async function waitUntilSettled(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (
    Date.now() < deadline &&
    (runtime.status === "INITIALIZING" || runtime.status === "RECONNECTING")
  ) {
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/**
 * Replaces a client created by older code with a fresh one on the same saved
 * session — no QR code. Only ever happens in development, after a hot reload
 * that changed the client.
 */
async function refreshStaleClient(): Promise<void> {
  if (!runtime.client || runtime.clientVersion === CLIENT_API_VERSION) return

  runtime.swapping ??= (async () => {
    log("o código do cliente mudou; reconectando com a mesma sessão")
    const stale = runtime.client
    clearTimers()
    abortSync("cliente substituído")
    runtime.stopping = true
    try {
      await stale?.stop()
    } catch (error) {
      console.error("[whatsapp] falha ao fechar o cliente antigo", error)
    } finally {
      runtime.stopping = false
    }
    runtime.client = null
    runtime.status = "RECONNECTING"
    await startClient()
    await waitUntilSettled(20_000)
  })().finally(() => {
    runtime.swapping = undefined
  })

  await runtime.swapping
}

// Swap right away after a hot reload, so the next action finds it connected.
void refreshStaleClient().catch((error) =>
  console.error("[whatsapp] falha ao atualizar o cliente", error)
)

/** Profile picture queries, one at a time (see `profilePictureUrl`). */
let pictureQueue: Promise<unknown> = Promise.resolve()
const PICTURE_GAP_MS = 250

/** The first of a lead's numbers that has a WhatsApp account. */
async function findWhatsAppJid(
  client: WhatsAppClient,
  candidates: string[]
): Promise<string | null> {
  for (const phone of candidates) {
    let jid: string | null
    try {
      jid = await client.checkNumber(phone)
    } catch (error) {
      console.error("[whatsapp] falha ao verificar número", error)
      throw new WhatsAppActionError(
        "Não foi possível verificar o número no WhatsApp. Tente novamente.",
        502
      )
    }
    if (jid) return jid
  }
  return null
}

export type WhatsAppSnapshot = {
  enabled: boolean
  /** Media storage is configured: files are shown and can be sent. */
  mediaEnabled: boolean
  status: WhatsAppStatus
  qr?: string
  phoneNumber?: string
  pushName?: string
  error?: string
  lastSyncAt?: Date
  lastSync?: WhatsAppSyncStats
  lastSyncError?: string
  /** Present while a sync runs. */
  sync?: {
    startedAt: Date
    conversations: number
    newMessages: number
    /** Real progress (0-100) only when WhatsApp reports it. */
    progress: number | null
  }
}

export const whatsappSessionService = {
  async snapshot(): Promise<WhatsAppSnapshot> {
    const config = settings()
    const session = await whatsappSessionRepository.get(config.sessionName)
    const sync = runtime.sync

    return {
      enabled: config.enabled,
      mediaEnabled: getMediaStorage() !== null,
      status: runtime.status,
      qr: runtime.status === "QR_REQUIRED" ? runtime.qr : undefined,
      phoneNumber: runtime.phone ?? session?.phoneNumber,
      pushName: runtime.pushName ?? session?.pushName,
      error: runtime.error,
      lastSyncAt: session?.lastSyncAt,
      lastSync: session?.lastSync,
      lastSyncError: session?.lastSyncError,
      sync: sync
        ? {
            startedAt: sync.stats.startedAt,
            conversations: sync.conversations.size,
            newMessages: sync.stats.newMessages,
            progress: sync.progress,
          }
        : undefined,
    }
  },

  /**
   * Starts the connection. Calling it again while a connection exists or is
   * being set up is a no-op: there is only ever one socket per session.
   */
  async connect(): Promise<WhatsAppSnapshot> {
    if (!settings().enabled) {
      throw new Error(
        "A integração com o WhatsApp está desativada (WHATSAPP_ENABLED)."
      )
    }

    const busy =
      runtime.client !== null &&
      runtime.status !== "DISCONNECTED" &&
      runtime.status !== "LOGGED_OUT" &&
      runtime.status !== "ERROR"

    if (!busy) {
      if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer)
      runtime.reconnectTimer = undefined
      runtime.reconnectAttempts = 0
      runtime.client = null
      runtime.status = "INITIALIZING"
      await startClient()
    }
    return this.snapshot()
  },

  /** Called on server start: reconnects only when a session was saved. */
  async autoStart(): Promise<void> {
    const config = settings()
    if (!config.enabled || runtime.client) return
    try {
      await access(join(config.authDir, "creds.json"))
    } catch {
      log("nenhuma sessão salva; aguardando o usuário conectar")
      return
    }
    log("sessão salva encontrada; reconectando automaticamente")
    await this.connect()
  },

  /** Runs the same incremental, idempotent sync on demand. */
  async sync(): Promise<WhatsAppSnapshot> {
    if (!isWhatsAppOnline(runtime.status)) return this.connect()
    beginSync("manual")
    return this.snapshot()
  },

  /** Unlinks this device from the phone and forgets the local session. */
  async disconnect(): Promise<WhatsAppSnapshot> {
    clearTimers()
    abortSync("desconectado pelo usuário")
    const client = runtime.client
    runtime.stopping = true
    try {
      if (client) await client.logout()
      else await rm(settings().authDir, { recursive: true, force: true })
      log("desconectado pelo usuário")
    } catch (error) {
      console.error("[whatsapp] falha ao desconectar", error)
    } finally {
      runtime.stopping = false
      runtime.client = null
      runtime.phone = undefined
      runtime.pushName = undefined
      runtime.reconnectAttempts = 0
    }
    setStatus("DISCONNECTED")
    persist({ phoneNumber: undefined, pushName: undefined })
    return this.snapshot()
  },

  /**
   * Sends a text and stores it right away, without waiting for the echo.
   * `replyTo` (a stored message id) sends it as a reply to that message.
   */
  sendText(
    conversationId: string,
    text: string,
    replyTo?: string
  ): Promise<WhatsAppMessage> {
    return deliver(
      conversationId,
      (client, chatJid, quoted) => client.sendText(chatJid, text, { quoted }),
      { replyTo }
    )
  },

  /**
   * Sends an image or an audio. The file goes to storage before the call
   * returns, so the chat can show it at once.
   */
  async sendMedia(
    conversationId: string,
    media: WaOutgoingMedia,
    replyTo?: string
  ): Promise<WhatsAppMessage> {
    if (!getMediaStorage()) {
      throw new WhatsAppActionError(
        "Configure o bucket S3 (AWS_S3_BUCKET) para enviar imagens, vídeos e áudios.",
        409
      )
    }
    return deliver(
      conversationId,
      async (client, chatJid, quoted) => {
        const sent = await client.sendMedia(chatJid, media, { quoted })
        // The file is already here; no need to fetch it back from WhatsApp.
        return {
          ...sent,
          media: {
            mimeType: media.mimeType,
            voiceNote: media.kind === "audio" ? media.voiceNote : undefined,
            seconds: media.kind === "video" ? media.seconds : undefined,
            ...sent.media,
            optimized: true,
            download: async () => media.data,
          },
        }
      },
      { awaitMedia: true, replyTo }
    )
  },

  /**
   * Deletes a conversation from the CRM: its messages and stored files go,
   * the contact and the lead stay. Nothing changes on the phone. Later syncs
   * skip what was deleted; a new message brings the chat back.
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    const result = await enqueue(async () => {
      const conversation =
        await whatsappConversationRepository.findById(conversationId)
      if (!conversation) return null

      const contact = await whatsappConversationRepository.findContactById(
        conversation.contactId
      )
      const mediaKeys =
        await whatsappMessageRepository.storedMediaKeys(conversationId)
      // The mark goes first: a sync landing mid-way cannot revive the chat.
      await whatsappConversationRepository.markChatsDeleted(
        [
          ...new Set(
            [conversation.whatsappChatId, contact?.lid].filter(
              (jid): jid is string => Boolean(jid)
            )
          ),
        ],
        new Date()
      )
      const messages =
        await whatsappMessageRepository.deleteByConversation(conversationId)
      await whatsappConversationRepository.deleteById(conversationId)
      await campaignRepository.clearConversation(conversationId)
      await followUpRepository.cancelByConversation(
        conversationId,
        "A conversa foi excluída."
      )
      return { messages, mediaKeys, title: conversation.title }
    })
    if (!result) return false

    log(
      `conversa "${result.title}" excluída (${result.messages} mensagens, ${result.mediaKeys.length} arquivos)`
    )
    emitWhatsAppEvent({
      type: "conversations",
      conversationIds: [conversationId],
    })

    // Files are cleaned up last: a failure here leaves orphans in the
    // bucket, never a half-deleted conversation.
    const storage = getMediaStorage()
    if (storage && result.mediaKeys.length > 0) {
      await storage
        .remove(result.mediaKeys)
        .catch((error) =>
          console.error(
            "[whatsapp] conversa excluída, mas os arquivos ficaram no S3 (falta a permissão s3:DeleteObject?)",
            error
          )
        )
    }
    return true
  },

  /** Connected and able to send right now. */
  isOnline(): boolean {
    return runtime.client !== null && isWhatsAppOnline(runtime.status)
  },

  /**
   * Checks a lead's numbers with WhatsApp without opening a conversation.
   * "offline" when it cannot be checked now; null when no number has WhatsApp.
   */
  async verifyLeadNumber(
    businessId: string
  ): Promise<string | null | "offline"> {
    const business = await businessRepository.findById(businessId)
    if (!business) return null
    const candidates = leadWhatsAppCandidates(business)
    if (candidates.length === 0) return null

    await refreshStaleClient()
    const client = runtime.client
    if (!client || !isWhatsAppOnline(runtime.status)) return "offline"
    return findWhatsAppJid(client, candidates)
  },

  /**
   * A contact's picture link, null when they show none, "offline" when it
   * cannot be asked now. Asked one at a time with a short gap: opening the
   * inbox requests a whole page of pictures, and a burst of queries is the
   * kind of traffic WhatsApp frowns upon.
   */
  async profilePictureUrl(jid: string): Promise<string | null | "offline"> {
    const run = pictureQueue.then(async () => {
      await refreshStaleClient()
      const client = runtime.client
      if (!client || !isWhatsAppOnline(runtime.status)) return "offline"
      try {
        return await client.profilePictureUrl(jid)
      } finally {
        await new Promise((resolve) => setTimeout(resolve, PICTURE_GAP_MS))
      }
    })
    pictureQueue = run.catch(() => {})
    return run
  },

  /** Whether WhatsApp is limiting new chats; null when offline or unknown. */
  async outreachStatus(): Promise<WaOutreachStatus | null> {
    await refreshStaleClient()
    const client = runtime.client
    if (!client || !isWhatsAppOnline(runtime.status)) return null
    try {
      return await client.outreachStatus()
    } catch (error) {
      console.error("[whatsapp] falha ao consultar limites da conta", error)
      return null
    }
  },

  /**
   * Opens (or reuses) the conversation with a lead, so the first message can
   * be sent from the CRM. Each of the lead's numbers is checked with WhatsApp
   * first; no conversation is created for a number without an account.
   */
  async startConversation(businessId: string): Promise<WhatsAppConversation> {
    const business = await businessRepository.findById(businessId)
    if (!business) throw new WhatsAppActionError("Lead não encontrado.", 404)

    const [existing] =
      await whatsappConversationRepository.listByBusiness(businessId)
    if (existing) return existing

    const candidates = leadWhatsAppCandidates(business)
    if (candidates.length === 0) {
      throw new WhatsAppActionError(
        "Este lead não tem telefone cadastrado. Edite o lead e informe um número.",
        422
      )
    }

    await refreshStaleClient()
    const client = runtime.client
    if (!client || !isWhatsAppOnline(runtime.status)) {
      throw new WhatsAppActionError(
        "O WhatsApp não está conectado. Conecte para iniciar conversas.",
        409
      )
    }

    const jid = await findWhatsAppJid(client, candidates)
    if (!jid) {
      throw new WhatsAppActionError(
        "Nenhum telefone deste lead tem WhatsApp.",
        422
      )
    }

    const chatJid = jid
    const conversation = await enqueue(async () => {
      // A brand-new contact is named after the business until WhatsApp
      // tells us more; a known contact keeps its address-book name.
      const contact =
        (await whatsappConversationRepository.findContactByJid(chatJid)) ??
        (await whatsappConversationRepository.upsertContact({
          jid: chatJid,
          phone: /^(\d+)@s\.whatsapp\.net$/.exec(chatJid)?.[1],
          name: business.name,
        }))
      const { conversation } =
        await whatsappConversationRepository.ensureConversation(
          chatJid,
          contact
        )
      // An existing chat already tied to another lead keeps that link.
      if (!conversation.businessId) {
        return (
          (await whatsappConversationRepository.setLead(
            conversation.id,
            businessId,
            "manual"
          )) ?? conversation
        )
      }
      return conversation
    })

    log(`conversa aberta com o lead ${businessId}`)
    emitWhatsAppEvent({
      type: "conversations",
      conversationIds: [conversation.id],
    })
    return conversation
  },

  /**
   * Opens a conversation with any number. Without a country code it is read
   * as Brazilian. When the number belongs to a lead, the conversation is
   * linked to it, as an incoming message would be.
   */
  async startConversationWithNumber(
    rawPhone: string,
    name?: string
  ): Promise<WhatsAppConversation> {
    const phone = toWhatsAppNumber(rawPhone, "BR")
    if (!phone) {
      throw new WhatsAppActionError(
        "Número inválido. Informe com DDD, por exemplo (11) 99999-8888.",
        422
      )
    }

    await refreshStaleClient()
    const client = runtime.client
    if (!client || !isWhatsAppOnline(runtime.status)) {
      throw new WhatsAppActionError(
        "O WhatsApp não está conectado. Conecte para iniciar conversas.",
        409
      )
    }

    const chatJid = await findWhatsAppJid(client, [phone])
    if (!chatJid) {
      throw new WhatsAppActionError("Este número não tem WhatsApp.", 422)
    }

    const conversation = await enqueue(async () => {
      // A name typed here only names contacts the CRM has never seen.
      const contact =
        (await whatsappConversationRepository.findContactByJid(chatJid)) ??
        (await whatsappConversationRepository.upsertContact({
          jid: chatJid,
          phone: /^(\d+)@s\.whatsapp\.net$/.exec(chatJid)?.[1],
          name,
        }))
      const { conversation } =
        await whatsappConversationRepository.ensureConversation(
          chatJid,
          contact
        )
      if (conversation.businessId || conversation.leadLinkSource === "manual")
        return conversation
      const businessId = await findLeadByPhone(conversation.phone)
      return businessId
        ? ((await whatsappConversationRepository.setLead(
            conversation.id,
            businessId,
            "auto"
          )) ?? conversation)
        : conversation
    })

    log(`conversa aberta com ${chatJid}`)
    emitWhatsAppEvent({
      type: "conversations",
      conversationIds: [conversation.id],
    })
    return conversation
  },
}

/** A WhatsApp action that failed, carrying the HTTP status the route should answer with. */
export class WhatsAppActionError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "WhatsAppActionError"
  }
}
