/**
 * Runs once when the Next.js server starts. If a WhatsApp session was saved,
 * it reconnects and syncs what arrived while the CRM was closed, and open
 * campaigns pick up where they stopped.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { whatsappSessionService } =
    await import("@/services/whatsapp/session.service")
  // Never hold up the server start: the inbox shows progress as it goes.
  void whatsappSessionService.autoStart().catch((error) => {
    console.error("[whatsapp] falha ao reconectar na inicialização", error)
  })

  // Campaigns resume where they stopped; the send queue waits for WhatsApp.
  const { campaignService } =
    await import("@/services/campaign/campaign.service")
  void campaignService.boot().catch((error) => {
    console.error("[campanha] falha ao retomar campanhas", error)
  })
}
