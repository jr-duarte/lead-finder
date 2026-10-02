import { rm } from "node:fs/promises"

import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  // Not a React hook despite the name; aliased so the hooks lint rule agrees.
  useMultiFileAuthState as loadMultiFileAuthState,
  type AnyMessageContent,
  type Chat,
  type WAMessage,
  type WASocket,
} from "baileys"

import { quotePreview } from "@/domain/whatsapp"
import type {
  WaBatch,
  WaClientHandlers,
  WaSendOptions,
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
  type MediaDownloader,
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

  // Sent messages carry no downloader: the caller already has the file.
  const send = async (
    chatJid: string,
    content: AnyMessageContent,
    options: WaSendOptions = {}
  ) => {
    if (!socket) throw new Error("WhatsApp não está conectado.")

    // Only the id has to match the original; the content is what the
    // contact sees in the quote bar, rebuilt from what is stored.
    const quoted: WAMessage | undefined = options.quoted
      ? {
          key: {
            remoteJid: chatJid,
            id: options.quoted.id,
            fromMe: options.quoted.fromMe,
          },
          message: { conversation: quotePreview(options.quoted) || " " },
        }
      : undefined

    const sent = await socket.sendMessage(chatJid, content, { quoted })
    const me = socket.user?.id ? jidNormalizedUser(socket.user.id) : "me"
    const normalized = sent ? normalizeMessage(sent, me) : null
    if (!normalized) {
      throw new Error("O WhatsApp não confirmou o envio da mensagem.")
    }
    return { ...normalized, chatJid, to: chatJid }
  }

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
      // Old media is gone from WhatsApp's CDN; the phone can re-upload it.
      const download: MediaDownloader = (message) =>
        downloadMediaMessage(
          message,
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage, logger }
        )
      const normalize = (message: WAMessage) =>
        normalizeMessage(message, me(), download)

      /**
       * A message addressed by LID often carries the phone jid alongside.
       * Each pair teaches the CRM that both are one person, so a chat known
       * only by its LID is merged into the conversation by phone.
       */
      const learnLidMappings = (messages: WAMessage[]) => {
        const seen = new Set<string>()
        for (const { key } of messages) {
          const pairs: [unknown, unknown][] = [
            [key?.remoteJid, key?.remoteJidAlt],
            [key?.participant, key?.participantAlt],
          ]
          for (const [lid, pn] of pairs) {
            if (typeof lid !== "string" || typeof pn !== "string") continue
            if (!isLidUser(lid) || !isPnUser(pn)) continue
            const normalizedLid = jidNormalizedUser(lid)
            if (seen.has(normalizedLid)) continue
            seen.add(normalizedLid)
            handlers.onLidMapping({
              lid: normalizedLid,
              pnJid: jidNormalizedUser(pn),
            })
          }
        }
      }

      /**
       * Chat events may name a person only by LID. The phone jid, when
       * Baileys knows it, keeps them from becoming a second conversation.
       */
      const withPhoneJids = (chats: Partial<Chat>[]) =>
        Promise.all(
          chats.map(async (chat) => {
            if (!chat.id || chat.pnJid || !isLidUser(chat.id)) return chat
            const pn = await sock.signalRepository.lidMapping
              .getPNForLID(chat.id)
              .catch(() => null)
            return pn && isPnUser(pn)
              ? { ...chat, pnJid: jidNormalizedUser(pn) }
              : chat
          })
        )
      const emitChats = async (chats: Partial<Chat>[]) => {
        const resolved = await withPhoneJids(chats)
        emitBatch(
          handlers,
          {
            chats: compact(resolved.map(normalizeChat)),
            contacts: [],
            messages: [],
          },
          "live"
        )
      }

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
        learnLidMappings(history.messages)
        emitBatch(
          handlers,
          {
            chats: compact(history.chats.map(normalizeChat)),
            contacts: compact(history.contacts.map(normalizeContact)),
            messages: compact(history.messages.map(normalize)),
          },
          "history"
        )
      })

      sock.ev.on("messages.upsert", ({ messages, type }) => {
        learnLidMappings(messages)
        emitBatch(
          handlers,
          {
            chats: [],
            contacts: [],
            messages: compact(messages.map(normalize)),
          },
          type === "notify" ? "live" : "offline"
        )
      })

      sock.ev.on("chats.upsert", (chats) => void emitChats(chats))
      sock.ev.on("chats.update", (chats) => void emitChats(chats))

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

    sendText(chatJid, text, options) {
      return send(chatJid, { text }, options)
    },

    sendMedia(chatJid, media, options) {
      const content: AnyMessageContent =
        media.kind === "image"
          ? {
              image: media.data,
              mimetype: media.mimeType,
              caption: media.caption || undefined,
            }
          : media.kind === "video"
            ? {
                video: media.data,
                mimetype: media.mimeType,
                caption: media.caption || undefined,
                // Ours, made with the bundled ffmpeg: Baileys would look for
                // one on the PATH and silently skip the preview.
                jpegThumbnail: media.thumbnail?.toString("base64"),
                seconds: media.seconds,
              }
            : {
                audio: media.data,
                mimetype: media.mimeType,
                ptt: media.voiceNote,
              }
      return send(chatJid, content, options)
    },

    async checkNumber(phone) {
      if (!socket) throw new Error("WhatsApp não está conectado.")
      const [result] = (await socket.onWhatsApp(phone)) ?? []
      return result?.exists && result.jid ? jidNormalizedUser(result.jid) : null
    },

    async profilePictureUrl(jid) {
      if (!socket) throw new Error("WhatsApp não está conectado.")
      try {
        return (await socket.profilePictureUrl(jid, "preview")) ?? null
      } catch (error) {
        // WhatsApp's own code travels in `data` (Boom's statusCode is a
        // generic 500). 404: no picture; 401/403: hidden by privacy settings.
        const code = (error as { data?: unknown })?.data
        if (code === 401 || code === 403 || code === 404) return null
        throw error
      }
    },

    async outreachStatus() {
      if (!socket) throw new Error("WhatsApp não está conectado.")
      // Each query may fail on accounts where WhatsApp does not expose it;
      // unknown is treated as "no limit reported".
      const [lock, cap] = await Promise.all([
        socket.fetchAccountReachoutTimelock().catch(() => null),
        socket.fetchNewChatMessageCap().catch(() => null),
      ])
      const total = cap?.total_quota
      const used = cap?.used_quota
      // Accounts outside the capping program get total_quota 0 — that means
      // "no cap", not "cap used up". Only a positive quota or an explicit
      // CAPPED status counts as a limit.
      const capped =
        (typeof total === "number" && total > 0) ||
        cap?.capping_status === "CAPPED"
      return {
        restricted: Boolean(lock?.isActive),
        restrictedUntil: lock?.timeEnforcementEnds ?? undefined,
        newChatsRemaining:
          capped && typeof total === "number" && typeof used === "number"
            ? Math.max(0, total - used)
            : undefined,
      }
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
