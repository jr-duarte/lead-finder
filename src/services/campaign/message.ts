import { hasOffer } from "@/domain/approach"
import type { Campaign } from "@/domain/campaign"
import { runClaude } from "@/lib/claude-cli"
import { getEnv } from "@/lib/env"
import { businessRepository } from "@/repositories/business.repository"
import { noteRepository } from "@/repositories/note.repository"
import { settingsRepository } from "@/repositories/settings.repository"
import {
  ApproachInputError,
  describeLead,
  HUMAN_WRITING_RULES,
  LANGUAGE_RULES,
  stripDashes,
  stripSignature,
} from "@/services/approach.service"

/**
 * Writes a campaign's first WhatsApp message for one lead. Unlike the full
 * approach (e-mail, call script, objections), it asks only for the message,
 * and it follows the campaign's angle, so leads in different campaigns get
 * different pitches.
 */

const SYSTEM_PROMPT = `Você é um SDR sênior que prospecta pequenas e médias empresas no Brasil. Escreve a primeira mensagem de WhatsApp que o vendedor manda, do próprio celular, para um negócio que nunca falou com ele.

Regras:
- Use apenas os fatos fornecidos sobre o lead. Não invente números, clientes, resultados nem conversas anteriores.
- Ancore a mensagem em uma observação concreta dos dados (ex.: não tem site, muitas avaliações no Google, site em plataforma genérica, empresa aberta há pouco tempo). A pessoa precisa perceber que o vendedor olhou para esse negócio específico.
- Conecte essa observação ao que o vendedor oferece. Se a oferta não fizer sentido para o lead, escreva algo honesto e leve, sem forçar.
- Siga o ângulo e as instruções da campanha quando houver. Quando conflitarem com as instruções gerais de tom do vendedor, vale a campanha.
- O nome da campanha é um rótulo interno: use como pista do segmento e do ângulo, nunca cite na mensagem.
- É um primeiro contato: a pessoa não conhece o vendedor. Se for se apresentar, faça no começo e em poucas palavras.
- Curta: 2 a 4 frases, até ~400 caracteres, no máximo 2 parágrafos. Sem link, sem preço e sem pedir reunião logo de cara, a não ser que a campanha peça.
- Termine com uma única pergunta fácil de responder, de preferência com sim ou não ou uma resposta curta.
- Varie a abertura. Não comece com "Oi, tudo bem?" seguido de pitch.
- Dados da Receita Federal podem pertencer a outra empresa (matriz, franqueadora, plataforma que hospeda o site). Se a razão social ou a atividade não combinarem com o lead, ignore-os.
- Só chame alguém pelo nome se houver um único sócio-administrador em empresa pequena; caso contrário, use uma saudação neutra.

${HUMAN_WRITING_RULES}

${LANGUAGE_RULES}`

const MESSAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: {
    message: {
      type: "string",
      description: "A mensagem de WhatsApp, pronta para enviar.",
    },
  },
} as const

export function buildCampaignMessagePrompt(
  campaign: Pick<Campaign, "name" | "brief">,
  leadSections: string[]
): string {
  const brief = campaign.brief?.trim()
  return [
    "Escreva a primeira mensagem de WhatsApp para este lead.",
    [
      "## Campanha",
      `- Nome (rótulo interno): ${campaign.name}`,
      brief ? `- Ângulo e instruções:\n${brief}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    ...leadSections,
  ].join("\n\n")
}

export const campaignMessageService = {
  async write(
    businessId: string,
    campaign: Pick<Campaign, "name" | "brief">
  ): Promise<string> {
    const [business, notes, seller] = await Promise.all([
      businessRepository.findById(businessId),
      noteRepository.listByBusiness(businessId),
      settingsRepository.getSeller(),
    ])
    if (!business) throw new ApproachInputError("Empresa não encontrada.", 404)
    if (!hasOffer(seller)) {
      throw new ApproachInputError(
        "Descreva o que você oferece em Configurações antes de gerar mensagens.",
        422
      )
    }

    const env = getEnv()
    const reply = (await runClaude(
      buildCampaignMessagePrompt(
        campaign,
        describeLead(business, notes, seller)
      ),
      {
        bin: env.CLAUDE_CLI_PATH,
        model: env.CLAUDE_CLI_MODEL,
        timeoutMs: env.CLAUDE_CLI_TIMEOUT_MS,
        systemPrompt: SYSTEM_PROMPT,
        schema: MESSAGE_SCHEMA,
      }
    )) as { message?: string }

    return stripSignature(
      stripDashes(reply.message?.trim() ?? ""),
      seller.sellerName
    ).trim()
  },
}
