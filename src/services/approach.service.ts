import type { LeadApproach, SellerProfile } from "@/domain/approach"
import { hasOffer } from "@/domain/approach"
import { OPERATIONAL_STATUS_LABELS, type Business } from "@/domain/business"
import { formatCnpj } from "@/domain/cnpj"
import type { Note } from "@/domain/note"
import { PIPELINE_STAGE_LABELS } from "@/domain/pipeline"
import { runClaude } from "@/lib/claude-cli"
import { getEnv } from "@/lib/env"
import { businessRepository } from "@/repositories/business.repository"
import { noteRepository } from "@/repositories/note.repository"
import { settingsRepository } from "@/repositories/settings.repository"

/** Raised for problems the user fixes themselves; the route maps it to 4xx. */
export class ApproachInputError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "ApproachInputError"
  }
}

const SYSTEM_PROMPT = `Você é um SDR sênior que prospecta pequenas e médias empresas no Brasil. Escreve abordagens comerciais em português do Brasil para um vendedor que vai enviá-las pessoalmente.

Regras:
- Use apenas os fatos fornecidos sobre o lead. Não invente números, clientes, resultados nem conversas anteriores.
- Ancore a abordagem em uma observação concreta dos dados (ex.: não tem site, muitas avaliações no Google, site em plataforma genérica, empresa aberta há pouco tempo). Mostre que o vendedor olhou para esse negócio específico.
- Conecte essa observação ao que o vendedor oferece. Se a oferta não fizer sentido para o lead, diga isso no diagnóstico e escreva uma abordagem honesta e leve.
- WhatsApp: curto (até ~500 caracteres), conversacional, uma pergunta no final que seja fácil de responder. Sem textão, sem lista.
- E-mail: assunto curto e específico; corpo com até ~120 palavras.
- Roteiro de ligação: abertura, pergunta de descoberta e pedido de próximo passo, em tópicos curtos.
- Follow-up: uma mensagem curta para quando o primeiro contato não tiver resposta, trazendo um ângulo novo.
- Objeções: 2 ou 3 objeções prováveis para esse tipo de negócio, com respostas curtas.
- Dados da Receita Federal podem pertencer a outra empresa (matriz, franqueadora, plataforma que hospeda o site). Se a razão social ou a atividade não combinarem com o lead, ignore-os e mencione isso no diagnóstico.
- Só chame alguém pelo nome se houver um único sócio-administrador em empresa pequena; caso contrário, use uma saudação neutra.
- Se houver anotações, respeite o histórico e a etapa do funil: não escreva como primeiro contato para quem já conversou.
- Siga as instruções de tom do vendedor quando houver.

Escrita humana:
As mensagens saem do celular e do e-mail do próprio vendedor. Se o dono do negócio sentir cheiro de texto automático ou de IA, ignora na hora. Escreva como uma pessoa real digitando rápido para outra, não como um redator.
- Nunca use travessão (— ou –) em nenhum campo. Onde ele caberia, use vírgula, ponto ou quebre em duas frases.
- Nada de emojis, a não ser que as instruções de tom do vendedor peçam.
- Português falado do dia a dia: "pra", "tô", "vi que", "queria te perguntar". Frases curtas e diretas, com ritmo irregular, sem cada frase ter o mesmo tamanho.
- Evite as marcas típicas de IA: aberturas como "Espero que esteja bem" ou "Tudo bem? Espero que sim"; a estrutura "não é X, é Y"; listas de três adjetivos ou benefícios; perguntas retóricas em série; frases de efeito no final.
- Evite jargão de vendas e de marketing: "solução", "alavancar", "potencializar", "otimizar", "transformar", "jornada", "sem compromisso", "agregar valor", "parceria de sucesso".
- Não elogie de forma genérica ("adorei o trabalho de vocês"). Se for citar algo, cite o fato ("vi que vocês têm mais de 500 avaliações").
- Sem negrito, sem marcadores e sem aspas decorativas nas mensagens de WhatsApp, e-mail e follow-up. O roteiro de ligação pode ter tópicos curtos, porque é só para o vendedor ler.
- Assinatura simples, só o nome e a empresa, do jeito que alguém assina de verdade.`

const APPROACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "diagnosis",
    "hook",
    "whatsapp",
    "emailSubject",
    "emailBody",
    "callScript",
    "followUp",
    "objections",
  ],
  properties: {
    diagnosis: {
      type: "string",
      description:
        "2 a 4 frases: o que os dados dizem sobre o lead e onde está a oportunidade.",
    },
    hook: {
      type: "string",
      description: "O gancho principal da abordagem, em uma frase.",
    },
    whatsapp: { type: "string" },
    emailSubject: { type: "string" },
    emailBody: { type: "string" },
    callScript: { type: "string" },
    followUp: { type: "string" },
    objections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["objection", "answer"],
        properties: {
          objection: { type: "string" },
          answer: { type: "string" },
        },
      },
    },
  },
} as const

type ApproachReply = Omit<LeadApproach, "generatedAt" | "model">

/**
 * Dashes are the most recognisable tell of AI-written text, and the prompt
 * alone does not always keep them out. A dash opening a line is dropped; one
 * between words becomes a comma.
 */
export function stripDashes(text: string): string {
  return text
    .replace(/^[ \t]*[—–][ \t]*/gm, "")
    .replace(/[ \t]*[—–][ \t]*/g, ", ")
    .replace(/,\s*([.,;:!?])/g, "$1")
}

function humanize(reply: ApproachReply): ApproachReply {
  return {
    diagnosis: stripDashes(reply.diagnosis),
    hook: stripDashes(reply.hook),
    whatsapp: stripDashes(reply.whatsapp),
    emailSubject: stripDashes(reply.emailSubject),
    emailBody: stripDashes(reply.emailBody),
    callScript: stripDashes(reply.callScript),
    followUp: stripDashes(reply.followUp),
    objections: reply.objections.map((item) => ({
      objection: stripDashes(item.objection),
      answer: stripDashes(item.answer),
    })),
  }
}

function line(label: string, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null
  if (Array.isArray(value) && value.length === 0) return null
  return `- ${label}: ${Array.isArray(value) ? value.join(", ") : value}`
}

function section(title: string, lines: (string | null)[]): string | null {
  const filled = lines.filter((item): item is string => Boolean(item))
  return filled.length ? `## ${title}\n${filled.join("\n")}` : null
}

/**
 * Lays out everything the app knows about the lead. Missing fields are left
 * out rather than printed empty, and "no website" is stated explicitly
 * because it is often the whole pitch.
 */
export function buildApproachPrompt(
  business: Business,
  notes: Note[],
  seller: SellerProfile
): string {
  const { address, enrichment, registry } = business
  const socials = enrichment.socials

  const parts = [
    section("O que eu ofereço", [
      line("Vendedor", seller.sellerName),
      line("Oferta", seller.offer),
      line("Instruções de tom e estilo", seller.instructions),
    ]),
    section("Lead", [
      line("Nome", business.name),
      line("Categoria", business.category ?? business.primaryType),
      line(
        "Situação no Google",
        business.operationalStatus
          ? OPERATIONAL_STATUS_LABELS[business.operationalStatus]
          : undefined
      ),
      line(
        "Endereço",
        address.formatted ??
          [address.neighborhood, address.city, address.state]
            .filter(Boolean)
            .join(", ")
      ),
      line("Nota no Google", business.rating?.toFixed(1)),
      line("Número de avaliações", business.reviewsCount),
      line("Telefone", business.phone),
      line("Website", business.website ?? "não tem website"),
    ]),
    section("Presença digital (coletada do site)", [
      line("Título do site", enrichment.websiteTitle),
      line("Tecnologias detectadas no site", enrichment.technologies),
      line("E-mails", enrichment.emails),
      line("Instagram", socials.instagram && `@${socials.instagram}`),
      line("Facebook", socials.facebook),
      line("LinkedIn", socials.linkedin),
      line("WhatsApp", socials.whatsapp),
      line("Erro ao acessar o site", enrichment.error),
    ]),
    registry?.fetchedAt
      ? section("Receita Federal", [
          line("CNPJ", formatCnpj(registry.cnpj ?? business.cnpj)),
          line("Razão social", registry.legalName),
          line("Nome fantasia", registry.tradeName),
          line("Situação cadastral", registry.status),
          line("Abertura", registry.openedAt),
          line("Porte", registry.size),
          line("MEI", registry.mei ? "sim" : undefined),
          line("Natureza jurídica", registry.legalNature),
          line(
            "Atividade principal",
            registry.mainActivity?.description ?? registry.mainActivity?.code
          ),
          line(
            "Sócios",
            registry.partners.map((partner) =>
              partner.role ? `${partner.name} (${partner.role})` : partner.name
            )
          ),
        ])
      : null,
    section("Funil", [
      line(
        "Etapa atual",
        business.pipeline
          ? PIPELINE_STAGE_LABELS[business.pipeline.stage]
          : "ainda não contatado"
      ),
    ]),
    notes.length
      ? `## Anotações (mais recentes primeiro)\n${notes
          .slice(0, 10)
          .map(
            (note) =>
              `- ${note.createdAt.toISOString().slice(0, 10)}${
                note.stage ? ` [${PIPELINE_STAGE_LABELS[note.stage]}]` : ""
              }: ${note.content}`
          )
          .join("\n")}`
      : null,
  ]

  return [
    "Escreva a abordagem comercial para este lead.",
    ...parts.filter(Boolean),
  ].join("\n\n")
}

/**
 * Leads with a generation running in this server process. Kept on globalThis
 * so a dev hot reload of this module does not forget runs still in progress.
 */
const globalForApproach = globalThis as typeof globalThis & {
  approachInFlight?: Set<string>
}
const inFlight = (globalForApproach.approachInFlight ??= new Set<string>())

export const approachService = {
  /**
   * Refuses a second run for a lead that is already being generated: each
   * run costs plan usage, and the later one would overwrite the other.
   */
  async generate(businessId: string): Promise<Business> {
    if (inFlight.has(businessId)) {
      throw new ApproachInputError(
        "Já existe uma abordagem sendo gerada para este lead. Aguarde terminar.",
        409
      )
    }

    inFlight.add(businessId)
    try {
      return await generateApproach(businessId)
    } finally {
      inFlight.delete(businessId)
    }
  },
}

async function generateApproach(businessId: string): Promise<Business> {
  const [business, notes, seller] = await Promise.all([
    businessRepository.findById(businessId),
    noteRepository.listByBusiness(businessId),
    settingsRepository.getSeller(),
  ])

  if (!business) throw new ApproachInputError("Empresa não encontrada.", 404)

  if (!hasOffer(seller)) {
    throw new ApproachInputError(
      "Descreva o que você oferece em Configurações antes de gerar abordagens.",
      422
    )
  }

  const env = getEnv()
  const reply = (await runClaude(buildApproachPrompt(business, notes, seller), {
    bin: env.CLAUDE_CLI_PATH,
    model: env.CLAUDE_CLI_MODEL,
    timeoutMs: env.CLAUDE_CLI_TIMEOUT_MS,
    systemPrompt: SYSTEM_PROMPT,
    schema: APPROACH_SCHEMA,
  })) as ApproachReply

  const approach: LeadApproach = {
    ...humanize(reply),
    generatedAt: new Date(),
    model: env.CLAUDE_CLI_MODEL,
  }

  const updated = await businessRepository.update(businessId, { approach })
  if (!updated) throw new ApproachInputError("Empresa não encontrada.", 404)

  return updated
}
