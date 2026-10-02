import { EventEmitter } from "node:events"

import type { WhatsAppStatus } from "@/domain/whatsapp"

/**
 * In-process bus between the WhatsApp services and the SSE endpoint. Kept on
 * globalThis: instrumentation and route handlers are bundled separately and
 * would otherwise each get their own emitter.
 */
export type WhatsAppEvent =
  | { type: "status"; status: WhatsAppStatus }
  | { type: "conversations"; conversationIds: string[] }
  | { type: "message"; conversationId: string }
  /** Delivery receipts changed; open chats refresh their ticks. */
  | { type: "message-status" }

const globalForEvents = globalThis as typeof globalThis & {
  __leadFinderWhatsAppEvents?: EventEmitter
}

const emitter = globalForEvents.__leadFinderWhatsAppEvents ?? new EventEmitter()
// One listener per open browser tab.
emitter.setMaxListeners(100)
globalForEvents.__leadFinderWhatsAppEvents = emitter

export function emitWhatsAppEvent(event: WhatsAppEvent): void {
  emitter.emit("event", event)
}

export function onWhatsAppEvent(
  listener: (event: WhatsAppEvent) => void
): () => void {
  emitter.on("event", listener)
  return () => {
    emitter.off("event", listener)
  }
}
