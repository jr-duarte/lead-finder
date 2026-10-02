import type {
  WhatsAppSessionInfo,
  WhatsAppStatus,
  WhatsAppSyncStats,
} from "@/domain/whatsapp"
import { connectToDatabase } from "@/lib/mongoose"
import {
  WhatsAppSessionModel,
  type WhatsAppSessionDocument,
} from "@/models/whatsapp-session.model"

function toSessionInfo(raw: WhatsAppSessionDocument): WhatsAppSessionInfo {
  return {
    sessionName: raw.sessionName,
    status: (raw.status ?? "DISCONNECTED") as WhatsAppStatus,
    phoneNumber: raw.phoneNumber ?? undefined,
    pushName: raw.pushName ?? undefined,
    lastConnectedAt: raw.lastConnectedAt ?? undefined,
    lastSyncAt: raw.lastSyncAt ?? undefined,
    lastSync: raw.lastSync
      ? {
          startedAt: raw.lastSync.startedAt,
          finishedAt: raw.lastSync.finishedAt ?? undefined,
          conversations: raw.lastSync.conversations ?? 0,
          newMessages: raw.lastSync.newMessages ?? 0,
        }
      : undefined,
    lastSyncError: raw.lastSyncError ?? undefined,
  }
}

export const whatsappSessionRepository = {
  async get(sessionName: string): Promise<WhatsAppSessionInfo | null> {
    await connectToDatabase()
    const raw = await WhatsAppSessionModel.findOne({ sessionName })
      .lean<WhatsAppSessionDocument>()
      .exec()
    return raw ? toSessionInfo(raw) : null
  },

  async update(
    sessionName: string,
    patch: Partial<Omit<WhatsAppSessionInfo, "sessionName">>
  ): Promise<void> {
    await connectToDatabase()
    const $set: Record<string, unknown> = {}
    const $unset: Record<string, 1> = {}
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) $unset[key] = 1
      else $set[key] = value
    }
    await WhatsAppSessionModel.updateOne(
      { sessionName },
      { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
      { upsert: true }
    ).exec()
  },

  /**
   * Moves the bookmark to when the sync *started*: anything that arrived
   * while it ran is covered again by the next one.
   */
  async recordSync(sessionName: string, stats: WhatsAppSyncStats) {
    await this.update(sessionName, {
      lastSyncAt: stats.startedAt,
      lastSync: stats,
      lastSyncError: undefined,
    })
  },
}
