import { onWhatsAppEvent } from "@/services/whatsapp/events"

export const dynamic = "force-dynamic"

/** Proxies and load balancers drop connections that stay silent. */
const KEEPALIVE_MS = 25_000

/**
 * Server-sent events: the browser learns about new messages and status
 * changes without polling. Events carry ids only; the client refetches.
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }

      write(`retry: 3000\n\n`)
      const unsubscribe = onWhatsAppEvent((event) =>
        write(`data: ${JSON.stringify(event)}\n\n`)
      )
      const keepalive = setInterval(() => write(": ping\n\n"), KEEPALIVE_MS)

      cleanup = () => {
        unsubscribe()
        clearInterval(keepalive)
      }

      request.signal.addEventListener("abort", () => {
        cleanup()
        try {
          controller.close()
        } catch {
          // Already closed by the runtime.
        }
      })
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
