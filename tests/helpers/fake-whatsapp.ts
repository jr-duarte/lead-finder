import type {
  WaClientHandlers,
  WaMessage,
  WaOutgoingMedia,
  WaOutreachStatus,
  WaQuote,
  WaSendOptions,
  WhatsAppClient,
} from "@/lib/whatsapp/client"

/** Stands in for Baileys: tests drive the events by hand. */
export class FakeWhatsAppClient implements WhatsAppClient {
  handlers: WaClientHandlers | null = null
  starts = 0
  sent: { chatJid: string; text: string }[] = []
  sentMedia: { chatJid: string; media: WaOutgoingMedia }[] = []
  /** What each send quoted, in order, across texts and media. */
  quotes: (WaQuote | undefined)[] = []
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

  async sendText(
    chatJid: string,
    text: string,
    options: WaSendOptions = {}
  ): Promise<WaMessage> {
    if (this.failSends > 0) {
      this.failSends -= 1
      throw new Error("falha simulada de envio")
    }
    this.sent.push({ chatJid, text })
    this.quotes.push(options.quoted)
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
      quoted: options.quoted,
    }
  }

  async sendMedia(
    chatJid: string,
    media: WaOutgoingMedia,
    options: WaSendOptions = {}
  ): Promise<WaMessage> {
    this.sentMedia.push({ chatJid, media })
    this.quotes.push(options.quoted)
    return {
      id: `sent-${(this.counter += 1)}`,
      chatJid,
      fromMe: true,
      from: "5511000000000@s.whatsapp.net",
      to: chatJid,
      body: media.kind === "image" ? (media.caption ?? "") : "",
      type: media.kind,
      timestamp: new Date(),
      status: "SENT",
      quoted: options.quoted,
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
