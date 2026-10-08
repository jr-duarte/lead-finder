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

  // Leads saved before phones had a type get one, so the WhatsApp filter
  // sees them.
  const { businessRepository } =
    await import("@/repositories/business.repository")
  void businessRepository
    .backfillPhoneFields()
    .then((count) => {
      if (count > 0)
        console.info(`[leads] tipo de telefone em ${count} lead(s)`)
    })
    .catch((error) => {
      console.error("[leads] falha ao classificar telefones", error)
    })

  // Sites enriched before the "not working" flag existed get it, so the
  // website filter sees them.
  void businessRepository
    .backfillWebsiteBroken()
    .then((count) => {
      if (count > 0)
        console.info(`[leads] situação do site em ${count} lead(s)`)
    })
    .catch((error) => {
      console.error("[leads] falha ao classificar sites", error)
    })

  // Campaigns resume where they stopped; the send queue waits for WhatsApp.
  const { campaignService } =
    await import("@/services/campaign/campaign.service")
  void campaignService.boot().catch((error) => {
    console.error("[campanha] falha ao retomar campanhas", error)
  })

  // Follow-ups: leads in "Contatado" that did not answer get one more message.
  const { followUpService } =
    await import("@/services/follow-up/follow-up.service")
  void followUpService.boot().catch((error) => {
    console.error("[follow-up] falha ao iniciar", error)
  })
}
