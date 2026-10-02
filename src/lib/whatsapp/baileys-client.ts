import { rm } from "node:fs/promises"

import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  // Not a React hook despite the name; aliased so the hooks lint rule agrees.
  useMultiFileAuthState as loadMultiFileAuthState,
  type WASocket,
} from "baileys"

import type {
  WaBatch,
  WaClientHandlers,
  WhatsAppClient,
  WhatsAppClientConfig,
} from "@/lib/whatsapp/client"
import {
  isIgnoredJid,
  normalizeChat,
  normalizeContact,
  normalizeMessage,
  phoneFromJid,
  statusFromAck,
} from "@/lib/whatsapp/baileys-normalize"

/**
 * The only module that talks to Baileys. It turns socket events into the
 * neutral shapes of `client.ts`; every decision lives in the services.
 */

type BaileysLogger = NonNullable<Parameters<typeof makeWASocket>[0]["logger"]>

/** Baileys is chatty at info level; only warnings and errors are kept. */
const logger: BaileysLogger = {
  level: "warn",
  child: () => logger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: (obj, msg) => console.warn("[whatsapp:baileys]", msg ?? "", obj),
  error: (obj, msg) => console.error("[whatsapp:baileys]", msg ?? "", obj),
}

function statusCodeOf(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } } | undefined)?.output
    ?.statusCode
}

function toPnJid(pn: string): string {
  return pn.includes("@") ? jidNormalizedUser(pn) : `${pn}@s.whatsapp.net`
}

export function createBaileysClient(
  config: WhatsAppClientConfig
): WhatsAppClient {
  let socket: WASocket | null = null

  const ignore = (jid: string) => isIgnoredJid(jid, config.includeGroups)

  const emitBatch = (
    handlers: WaClientHandlers,
    batch: WaBatch,
    source: Parameters<WaClientHandlers["onBatch"]>[1]
  ) => {
    const filtered: WaBatch = {
      chats: batch.chats.filter((chat) => !ignore(chat.jid)),
      contacts: batch.contacts.filter((contact) => !ignore(contact.jid)),
      messages: batch.messages.filter((message) => !ignore(message.chatJid)),
    }
    if (
      filtered.chats.length ||
      filtered.contacts.length ||
      filtered.messages.length
    ) {
      handlers.onBatch(filtered, source)
    }
  }

  // An intentional close must not look like a dropped connection.
  const detach = (sock: WASocket) => {
    sock.ev.removeAllListeners("connection.update")
  }

  const compact = <T>(items: (T | null)[]) =>
    items.filter((item): item is T => item !== null)

  return {
    async start(handlers) {
      // A restart replaces the socket; the old one must not keep emitting.
      if (socket) {
        detach(socket)
        socket.end(undefined)
        socket = null
      }

      const { state, saveCreds } = await loadMultiFileAuthState(config.authDir)

      // The bundled protocol version goes stale; fall back to it only when
      // the latest one cannot be fetched.
      const latest = await fetchLatestBaileysVersion().catch(() => null)

      const sock = makeWASocket({
        auth: state,
        ...(latest?.version ? { version: latest.version } : {}),
        logger,
        browser: Browsers.macOS("Chrome"),
        // Staying "offline" keeps notifications coming to the phone.
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldIgnoreJid: (jid) => ignore(jid),
        getMessage: async (key) => {
          const body = key.id
            ? await config.getStoredMessage(key.id)
            : undefined
          return body !== undefined ? { conversation: body } : undefined
        },
      })
      socket = sock

      let sawQr = false
      const me = () => (sock.user?.id ? jidNormalizedUser(sock.user.id) : "")

      sock.ev.on("creds.update", saveCreds)

      sock.ev.on("connection.update", (update) => {
        if (update.qr) {
          sawQr = true
          handlers.onQr(update.qr)
        }

        if (update.connection === "open") {
          handlers.onOpen({
            phone: phoneFromJid(me()),
            pushName: sock.user?.name ?? sock.user?.notify ?? undefined,
          })
        }

        if (update.receivedPendingNotifications) handlers.onCaughtUp()

        if (update.connection === "close") {
          if (socket === sock) socket = null
          const error = update.lastDisconnect?.error
          const code = statusCodeOf(error)
          handlers.onClose({
            loggedOut:
              code === DisconnectReason.loggedOut ||
              code === DisconnectReason.forbidden,
            restartRequired: code === DisconnectReason.restartRequired,
            qrExpired:
              sawQr && /QR refs attempts ended/i.test(error?.message ?? ""),
            replaced: code === DisconnectReason.connectionReplaced,
            message: error?.message,
          })
        }
      })

      sock.ev.on("messaging-history.set", (history) => {
        if (typeof history.progress === "number") {
          handlers.onHistoryProgress(history.progress)
        }
        for (const mapping of history.lidPnMappings ?? []) {
          handlers.onLidMapping({
            lid: jidNormalizedUser(mapping.lid),
            pnJid: toPnJid(mapping.pn),
          })
        }
        emitBatch(
          handlers,
          {
            chats: compact(history.chats.map(normalizeChat)),
            contacts: compact(history.contacts.map(normalizeContact)),
            messages: compact(
              history.messages.map((message) => normalizeMessage(message, me()))
            ),
          },
          "history"
        )
      })

      sock.ev.on("messages.upsert", ({ messages, type }) => {
        emitBatch(
          handlers,
          {
            chats: [],
            contacts: [],
            messages: compact(
              messages.map((message) => normalizeMessage(message, me()))
            ),
          },
          type === "notify" ? "live" : "offline"
        )
      })

      sock.ev.on("chats.upsert", (chats) => {
        emitBatch(
          handlers,
          {
            chats: compact(chats.map(normalizeChat)),
            contacts: [],
            messages: [],
          },
          "live"
        )
      })

      sock.ev.on("chats.update", (chats) => {
        emitBatch(
          handlers,
          {
            chats: compact(chats.map(normalizeChat)),
            contacts: [],
            messages: [],
          },
          "live"
        )
      })

      const onContacts = (contacts: Parameters<typeof normalizeContact>[0][]) =>
        emitBatch(
          handlers,
          {
            chats: [],
            contacts: compact(contacts.map(normalizeContact)),
            messages: [],
          },
          "live"
        )
      sock.ev.on("contacts.upsert", onContacts)
      sock.ev.on("contacts.update", onContacts)

      sock.ev.on("messages.update", (updates) => {
        const statuses = updates.flatMap(({ key, update }) =>
          key.id && key.fromMe && typeof update.status === "number"
            ? [{ id: key.id, status: statusFromAck(update.status, true) }]
            : []
        )
        if (statuses.length) handlers.onMessageStatus(statuses)
      })

      sock.ev.on("lid-mapping.update", (mapping) => {
        handlers.onLidMapping({
          lid: jidNormalizedUser(mapping.lid),
          pnJid: toPnJid(mapping.pn),
        })
      })
    },

    async sendText(chatJid, text) {
      if (!socket) throw new Error("WhatsApp não está conectado.")

      const sent = await socket.sendMessage(chatJid, { text })
      const me = socket.user?.id ? jidNormalizedUser(socket.user.id) : "me"
      const normalized = sent ? normalizeMessage(sent, me) : null
      if (!normalized) {
        throw new Error("O WhatsApp não confirmou o envio da mensagem.")
      }
      return { ...normalized, chatJid, to: chatJid }
    },

    async checkNumber(phone) {
      if (!socket) throw new Error("WhatsApp não está conectado.")
      const [result] = (await socket.onWhatsApp(phone)) ?? []
      return result?.exists && result.jid ? jidNormalizedUser(result.jid) : null
    },

    async logout() {
      const current = socket
      socket = null
      if (current) detach(current)
      try {
        await current?.logout()
      } finally {
        await rm(config.authDir, { recursive: true, force: true })
      }
    },

    async stop() {
      const current = socket
      socket = null
      if (current) {
        detach(current)
        current.end(undefined)
      }
    },
  }
}
