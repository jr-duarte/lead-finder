import type { LeadApproach, SellerProfile } from "@/domain/approach"
import { hasOffer } from "@/domain/approach"
import { OPERATIONAL_STATUS_LABELS, type Business } from "@/domain/business"
import { formatCnpj } from "@/domain/cnpj"
import { countryName, leadCountry } from "@/domain/phone"
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

/**
 * How every message the seller sends should read. Shared with the WhatsApp
 * reply suggestions so both sound like the same person.
 */
export const HUMAN_WRITING_RULES = `Escrita humana:
As mensagens saem do celular e do e-mail do próprio vendedor. Se o dono do negócio sentir cheiro de texto automático ou de IA, ignora na hora. Escreva como uma pessoa real digitando rápido para outra, não como um redator.
- Nunca use travessão (— ou –) em nenhum campo. Onde ele caberia, use vírgula, ponto ou quebre em duas frases.
- Nada de emojis, a não ser que as instruções de tom do vendedor peçam.
- Português falado do dia a dia: "pra", "tô", "vi que", "queria te perguntar". Frases curtas e diretas, com ritmo irregular, sem cada frase ter o mesmo tamanho.
- Evite as marcas típicas de IA: aberturas como "Espero que esteja bem" ou "Tudo bem? Espero que sim"; a estrutura "não é X, é Y"; listas de três adjetivos ou benefícios; perguntas retóricas em série; frases de efeito no final.
- Evite jargão de vendas e de marketing: "solução", "alavancar", "potencializar", "otimizar", "transformar", "jornada", "sem compromisso", "agregar valor", "parceria de sucesso".
- Não elogie de forma genérica ("adorei o trabalho de vocês"). Se for citar algo, cite o fato ("vi que vocês têm mais de 500 avaliações").
- Sem negrito, sem marcadores e sem aspas decorativas nas mensagens de WhatsApp, e-mail e follow-up. O roteiro de ligação pode ter tópicos curtos, porque é só para o vendedor ler.
- WhatsApp e follow-up nunca terminam com assinatura nem despedida ("Abraço, Fulano", nome no fim, nome da empresa no fim). A pessoa já vê quem mandou, e nome no final denuncia mensagem automática. Se fizer sentido se apresentar, faça no começo e de um jeito natural ("aqui é o Junior").
- No e-mail, termine só com o primeiro nome, como alguém faz de verdade.`

/**
 * Leads abroad get messages in their own language. The writing rules above
 * were written for Brazilian Portuguese, so they are carried over in spirit.
 */
export const LANGUAGE_RULES = `Idioma:
- O que vai para o lead é escrito no idioma falado no país dele (campo "País" da seção Lead). Brasil ou país não informado: português do Brasil.
- Portugal, Angola, Moçambique e outros países lusófonos: português de lá, com o vocabulário local (em Portugal, "telemóvel", "estou a ver"), sem gírias brasileiras como "pra" e "tô".
- Países de língua espanhola: o espanhol daquele país. Os demais: o idioma principal do país.
- As regras de escrita humana foram pensadas para o português do Brasil. Em outro idioma, aplique o equivalente: o tom falado e informal daquele idioma, sem as marcas típicas de texto de IA dele.
- Se as instruções do vendedor ou da campanha definirem o idioma, elas valem.`

const SYSTEM_PROMPT = `Você é um SDR sênior que prospecta pequenas e médias empresas no Brasil. Escreve abordagens comerciais para um vendedor brasileiro que vai enviá-las pessoalmente.

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
- O diagnóstico, o gancho e as objeções são para o vendedor ler: sempre em português do Brasil. WhatsApp, e-mail, roteiro de ligação e follow-up seguem o idioma do lead.

${HUMAN_WRITING_RULES}

${LANGUAGE_RULES}`

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

const SIGN_OFF =
  /^(um |grande )?(abraco|abracos|abs|att|atenciosamente|saudacoes|obrigad[oa]|valeu)[,.!]*$/

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Lowercase, no accents, single spaces: for comparing names loosely. */
function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Removes a signature from the end of a WhatsApp message: a closing line
 * with the seller's name (optionally followed by a short company line) and a
 * sign-off like "Abraço," right before it. Nobody signs WhatsApp messages;
 * a name at the bottom reads as automated. Text without the seller's name at
 * the end is returned unchanged.
 */
export function stripSignature(text: string, sellerName?: string): string {
  const name = normalizeText(sellerName ?? "")
  if (!name) return text
  const firstName = name.split(" ")[0]

  const isNameLine = (line: string) => {
    const clean = normalizeText(line)
      .replace(/^[-–—~\s]+/, "")
      .replace(/[.,!]+$/, "")
    if (!clean || line.includes("?")) return false
    if (clean === name || clean === firstName) return true
    // "Junior Duarte | Duarte Software", "Junior, da Duarte Software"
    return (
      clean.startsWith(firstName) &&
      clean.split(" ").length <= 8 &&
      clean.length <= name.length + 40
    )
  }
  const isShortLine = (line: string) =>
    line.trim().length > 0 && line.trim().length <= 40 && !line.includes("?")

  const lines = text.replace(/\s+$/, "").split("\n")
  const trimEnd = () => {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  }

  let removed = false
  const last = lines[lines.length - 1] ?? ""
  const beforeLast = lines[lines.length - 2] ?? ""
  if (isNameLine(last)) {
    lines.pop()
    removed = true
  } else if (lines.length > 1 && isNameLine(beforeLast) && isShortLine(last)) {
    // Name followed by a company line.
    lines.splice(-2, 2)
    removed = true
  } else {
    // Signed on the same line: "...uma ideia? Abraço, Junior".
    const fullName = escapeRegex(sellerName?.trim() ?? "")
    const shortName = escapeRegex(sellerName?.trim().split(/\s+/)[0] ?? "")
    const sameLine = new RegExp(
      `([.!?])\\s*(?:(?:um |grande )?(?:abraço|abraços|abs|att)[,.]?\\s*)?[-–—]?\\s*(?:${fullName}|${shortName})[.!]?\\s*$`,
      "i"
    )
    if (sameLine.test(last)) {
      lines[lines.length - 1] = last.replace(sameLine, "$1")
      removed = true
    }
  }

  if (!removed) return text
  trimEnd()
  if (
    lines.length > 1 &&
    SIGN_OFF.test(normalizeText(lines[lines.length - 1]))
  ) {
    lines.pop()
    trimEnd()
  }
  return lines.join("\n")
}

function humanize(reply: ApproachReply, sellerName?: string): ApproachReply {
  return {
    diagnosis: stripDashes(reply.diagnosis),
    hook: stripDashes(reply.hook),
    whatsapp: stripSignature(stripDashes(reply.whatsapp), sellerName),
    emailSubject: stripDashes(reply.emailSubject),
    emailBody: stripDashes(reply.emailBody),
    callScript: stripDashes(reply.callScript),
    followUp: stripSignature(stripDashes(reply.followUp), sellerName),
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
 * Lays out everything the app knows about the lead, as prompt sections. Missing fields are left
 * out rather than printed empty, and "no website" is stated explicitly
 * because it is often the whole pitch.
 */
export function describeLead(
  business: Business,
  notes: Note[],
  seller: SellerProfile
): string[] {
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
      line("País", countryName(leadCountry(business))),
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

  return parts.filter((part): part is string => Boolean(part))
}

export function buildApproachPrompt(
  business: Business,
  notes: Note[],
  seller: SellerProfile
): string {
  return [
    "Escreva a abordagem comercial para este lead.",
    ...describeLead(business, notes, seller),
  ].join("\n\n")
}

/**
 * Leads with a generation running in this server process. Kept on globalThis
 * so a dev hot reload of this module does not forget runs still in progress.
 */
const globalForApproach = globalThis as typeof globalThis & {
  __leadFinderApproachInFlight?: Set<string>
}

const inFlight: Set<string> =
  globalForApproach.__leadFinderApproachInFlight ?? new Set<string>()

globalForApproach.__leadFinderApproachInFlight = inFlight

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
    ...humanize(reply, seller.sellerName),
    generatedAt: new Date(),
    model: env.CLAUDE_CLI_MODEL,
  }

  const updated = await businessRepository.update(businessId, { approach })
  if (!updated) throw new ApproachInputError("Empresa não encontrada.", 404)

  return updated
}
