import type {
  WaClientHandlers,
  WaMessage,
  WaOutreachStatus,
  WhatsAppClient,
} from "@/lib/whatsapp/client"

/** Stands in for Baileys: tests drive the events by hand. */
export class FakeWhatsAppClient implements WhatsAppClient {
  handlers: WaClientHandlers | null = null
  starts = 0
  sent: { chatJid: string; text: string }[] = []
  loggedOut = false
  /** Numbers that "have WhatsApp", mapped to the jid WhatsApp answers with. */
  registered = new Map<string, string>()
  /** What `outreachStatus` reports; tests flip it to simulate restrictions. */
  outreach: WaOutreachStatus = { restricted: false }
  /** Makes the next sends throw, to simulate failures. */
  failSends = 0
  private counter = 0

  async checkNumber(phone: string) {
    return this.registered.get(phone) ?? null
  }

  async outreachStatus() {
    return this.outreach
  }

  async start(handlers: WaClientHandlers) {
    this.handlers = handlers
    this.starts += 1
  }

  async sendText(chatJid: string, text: string): Promise<WaMessage> {
    if (this.failSends > 0) {
      this.failSends -= 1
      throw new Error("falha simulada de envio")
    }
    this.sent.push({ chatJid, text })
    return {
      id: `sent-${(this.counter += 1)}`,
      chatJid,
      fromMe: true,
      from: "5511000000000@s.whatsapp.net",
      to: chatJid,
      body: text,
      type: "text",
      timestamp: new Date(),
      status: "SENT",
    }
  }

  async logout() {
    this.loggedOut = true
  }

  async stop() {}

  get on(): WaClientHandlers {
    if (!this.handlers) throw new Error("client not started")
    return this.handlers
  }
}
