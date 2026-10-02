import { Types } from "mongoose"

import {
  lowerMessageStatuses,
  type WhatsAppMediaStatus,
  type WhatsAppMessage,
  type WhatsAppMessageStatus,
  type WhatsAppMessageType,
} from "@/domain/whatsapp"
import type { WaMessage } from "@/lib/whatsapp/client"
import { connectToDatabase } from "@/lib/mongoose"
import {
  WhatsAppMessageModel,
  type WhatsAppMessageDocument,
} from "@/models/whatsapp-message.model"

type RawMessage = WhatsAppMessageDocument & {
  _id: Types.ObjectId
  createdAt?: Date
}

/** The CRM route that redirects to the stored file. */
export function whatsappMediaPath(messageId: string): string {
  return `/api/whatsapp/media/${messageId}`
}

/**
 * A download interrupted by a restart never finishes: past this age a
 * pending file reads as unavailable instead of loading forever.
 */
const MEDIA_STALLED_AFTER_MS = 10 * 60 * 1000

function mediaStatus(raw: RawMessage): WhatsAppMediaStatus {
  const status = raw.media?.status as WhatsAppMediaStatus
  const insertedAt = (raw.createdAt ?? raw.timestamp).getTime()
  return status === "pending" &&
    Date.now() - insertedAt > MEDIA_STALLED_AFTER_MS
    ? "failed"
    : status
}

export function toWhatsAppMessage(raw: RawMessage): WhatsAppMessage {
  const media = raw.media
    ? {
        mimeType: raw.media.mimeType,
        status: mediaStatus(raw),
        size: raw.media.size ?? undefined,
        seconds: raw.media.seconds ?? undefined,
        voiceNote: raw.media.voiceNote ?? undefined,
      }
    : undefined
  return {
    id: String(raw._id),
    conversationId: String(raw.conversationId),
    whatsappMessageId: raw.whatsappMessageId,
    from: raw.from,
    to: raw.to,
    body: raw.body ?? "",
    type: (raw.type ?? "text") as WhatsAppMessageType,
    timestamp: raw.timestamp,
    fromMe: raw.fromMe,
    status: (raw.status ??
      (raw.fromMe ? "SENT" : "RECEIVED")) as WhatsAppMessageStatus,
    media,
    quoted: raw.quoted
      ? {
          whatsappMessageId: raw.quoted.whatsappMessageId,
          fromMe: raw.quoted.fromMe,
          type: (raw.quoted.type ?? "other") as WhatsAppMessageType,
          body: raw.quoted.body ?? "",
        }
      : undefined,
    mediaUrl:
      media?.status === "stored"
        ? whatsappMediaPath(String(raw._id))
        : undefined,
    createdAt: raw.createdAt ?? raw.timestamp,
  }
}

/** A duplicate-key failure only means the message was already stored. */
function isDuplicateKeyOnly(error: unknown): boolean {
  const writeErrors = (error as { writeErrors?: { code?: number }[] })
    ?.writeErrors
  if (Array.isArray(writeErrors) && writeErrors.length > 0) {
    return writeErrors.every((item) => item.code === 11000)
  }
  return (error as { code?: number })?.code === 11000
}

export type InsertedMessage = {
  conversationId: string
  fromMe: boolean
  whatsappMessageId: string
}

export const whatsappMessageRepository = {
  /**
   * Stores the messages that are not there yet and reports which ones were
   * new. `$setOnInsert` + upsert on the unique id makes replays no-ops, so
   * this can run any number of times over the same data.
   */
  async insertNew(
    items: { conversationId: string; message: WaMessage }[]
  ): Promise<InsertedMessage[]> {
    await connectToDatabase()
    if (items.length === 0) return []

    const operations = items.map(({ conversationId, message }) => ({
      updateOne: {
        filter: { whatsappMessageId: message.id },
        update: {
          $setOnInsert: {
            conversationId: new Types.ObjectId(conversationId),
            whatsappMessageId: message.id,
            from: message.from,
            to: message.to,
            body: message.body,
            type: message.type,
            timestamp: message.timestamp,
            fromMe: message.fromMe,
            status: message.status,
            ...(message.media
              ? {
                  media: {
                    mimeType: message.media.mimeType,
                    status: "pending" as const,
                    seconds: message.media.seconds,
                    voiceNote: message.media.voiceNote,
                  },
                }
              : {}),
            ...(message.quoted
              ? {
                  quoted: {
                    whatsappMessageId: message.quoted.id,
                    fromMe: message.quoted.fromMe,
                    type: message.quoted.type,
                    body: message.quoted.body,
                  },
                }
              : {}),
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    }))

    let upsertedIndexes: number[]
    try {
      const result = await WhatsAppMessageModel.bulkWrite(operations, {
        ordered: false,
        // Otherwise Mongoose silently drops operations that fail to cast.
        throwOnValidationError: true,
      })
      upsertedIndexes = Object.keys(result.upsertedIds).map(Number)
    } catch (error) {
      // Two writers raced on the same id: the loser's copy already exists.
      if (!isDuplicateKeyOnly(error)) throw error
      const partial = (
        error as { result?: { upsertedIds?: Record<string, unknown> } }
      ).result
      upsertedIndexes = Object.keys(partial?.upsertedIds ?? {}).map(Number)
    }

    return upsertedIndexes.map((index) => ({
      conversationId: items[index].conversationId,
      fromMe: items[index].message.fromMe,
      whatsappMessageId: items[index].message.id,
    }))
  },

  /**
   * A page of history, newest first. `beforeId` is the oldest message the
   * client already has; ties on timestamp are broken by _id so no message
   * falls between two pages.
   */
  async listByConversation(
    conversationId: string,
    { beforeId, limit }: { beforeId?: string; limit: number }
  ): Promise<WhatsAppMessage[]> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(conversationId)) return []

    let cursorFilter: Record<string, unknown> = {}
    if (beforeId && Types.ObjectId.isValid(beforeId)) {
      const cursor = await WhatsAppMessageModel.findById(beforeId)
        .select("timestamp")
        .lean<{ _id: Types.ObjectId; timestamp: Date }>()
        .exec()
      if (cursor) {
        cursorFilter = {
          $or: [
            { timestamp: { $lt: cursor.timestamp } },
            { timestamp: cursor.timestamp, _id: { $lt: cursor._id } },
          ],
        }
      }
    }

    const raw = await WhatsAppMessageModel.find({
      conversationId,
      ...cursorFilter,
    })
      .sort({ timestamp: -1, _id: -1 })
      .limit(limit)
      .lean<RawMessage[]>()
      .exec()

    return raw.map(toWhatsAppMessage)
  },

  async latest(conversationId: string): Promise<WhatsAppMessage | null> {
    const [message] = await this.listByConversation(conversationId, {
      limit: 1,
    })
    return message ?? null
  },

  async findById(id: string): Promise<WhatsAppMessage | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null
    const raw = await WhatsAppMessageModel.findById(id)
      .lean<RawMessage>()
      .exec()
    return raw ? toWhatsAppMessage(raw) : null
  },

  /** Stored messages of one conversation among these WhatsApp ids. */
  async findManyByWhatsAppIds(
    conversationId: string,
    whatsappMessageIds: string[]
  ): Promise<WhatsAppMessage[]> {
    await connectToDatabase()
    if (whatsappMessageIds.length === 0) return []
    const raw = await WhatsAppMessageModel.find({
      conversationId,
      whatsappMessageId: { $in: whatsappMessageIds },
    })
      .lean<RawMessage[]>()
      .exec()
    return raw.map(toWhatsAppMessage)
  },

  async findByWhatsAppId(
    whatsappMessageId: string
  ): Promise<WhatsAppMessage | null> {
    await connectToDatabase()
    const raw = await WhatsAppMessageModel.findOne({ whatsappMessageId })
      .lean<RawMessage>()
      .exec()
    return raw ? toWhatsAppMessage(raw) : null
  },

  /** Delivery receipts only move forward: READ never drops back to SENT. */
  async updateStatuses(
    updates: { id: string; status: WhatsAppMessageStatus }[]
  ): Promise<number> {
    await connectToDatabase()
    const operations = updates.flatMap(({ id, status }) => {
      const lower = lowerMessageStatuses(status)
      if (lower.length === 0 && status !== "ERROR") return []
      return [
        {
          updateOne: {
            filter: {
              whatsappMessageId: id,
              fromMe: true,
              status: {
                $in:
                  status === "ERROR"
                    ? (["PENDING"] as WhatsAppMessageStatus[])
                    : lower,
              },
            },
            update: { $set: { status } },
          },
        },
      ]
    })
    if (operations.length === 0) return 0

    const result = await WhatsAppMessageModel.bulkWrite(operations, {
      ordered: false,
    })
    return result.modifiedCount
  },

  /** Records where a message's file was stored. */
  async setMediaStored(
    whatsappMessageId: string,
    stored: { storageKey: string; size: number; mimeType: string }
  ): Promise<void> {
    await connectToDatabase()
    await WhatsAppMessageModel.updateOne(
      { whatsappMessageId, media: { $exists: true } },
      {
        $set: {
          "media.status": "stored",
          "media.storageKey": stored.storageKey,
          "media.size": stored.size,
          "media.mimeType": stored.mimeType,
        },
      }
    ).exec()
  },

  async setMediaFailed(whatsappMessageId: string): Promise<void> {
    await connectToDatabase()
    await WhatsAppMessageModel.updateOne(
      { whatsappMessageId, "media.status": "pending" },
      { $set: { "media.status": "failed" } }
    ).exec()
  },

  /** Storage key and type of a message's file, when it has been stored. */
  async findStoredMedia(
    id: string
  ): Promise<{ storageKey: string; mimeType: string } | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null
    const raw = await WhatsAppMessageModel.findById(id)
      .select("media")
      .lean<RawMessage>()
      .exec()
    const media = raw?.media
    return media?.status === "stored" && media.storageKey
      ? { storageKey: media.storageKey, mimeType: media.mimeType }
      : null
  },

  async moveToConversation(fromId: string, toId: string): Promise<void> {
    await connectToDatabase()
    await WhatsAppMessageModel.updateMany(
      { conversationId: fromId },
      { $set: { conversationId: new Types.ObjectId(toId) } }
    ).exec()
  },

  /** Recent messages in chronological order, e.g. as context for an AI. */
  async recent(conversationId: string, limit: number) {
    const page = await this.listByConversation(conversationId, { limit })
    return page.reverse()
  },
}
