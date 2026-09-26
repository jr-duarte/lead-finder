import type {
  BusinessRegistry,
  BusinessRegistryActivity,
} from "@/domain/business"
import { isValidCnpj, normalizeCnpj } from "@/domain/cnpj"

/**
 * Looks a CNPJ up at Minha Receita (https://minhareceita.org), a free mirror
 * of the Receita Federal open data. No key is needed: GET /<cnpj> returns the
 * company record, 400 for an invalid number and 404 for an unknown one.
 */

export type CnpjLookupConfig = {
  /** Base URL, e.g. https://minhareceita.org. */
  endpoint: string
  timeoutMs: number
  userAgent: string
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export type CnpjLookupResult =
  { ok: true; registry: BusinessRegistry } | { ok: false; error: string }

/** The subset of the Minha Receita payload this app reads. */
type MinhaReceitaCompany = {
  cnpj?: string
  razao_social?: string | null
  nome_fantasia?: string | null
  descricao_situacao_cadastral?: string | null
  data_situacao_cadastral?: string | null
  data_inicio_atividade?: string | null
  porte?: string | null
  natureza_juridica?: string | null
  cnae_fiscal?: number | null
  cnae_fiscal_descricao?: string | null
  cnaes_secundarios?: { codigo?: number | null; descricao?: string | null }[]
  capital_social?: number | null
  opcao_pelo_simples?: boolean | null
  opcao_pelo_mei?: boolean | null
  email?: string | null
  ddd_telefone_1?: string | null
  ddd_telefone_2?: string | null
  qsa?: {
    nome_socio?: string | null
    qualificacao_socio?: string | null
    data_entrada_sociedade?: string | null
  }[]
}

/** Empty strings and nulls both mean "not informed" in the source data. */
function text(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function activity(
  code?: number | null,
  description?: string | null
): BusinessRegistryActivity | undefined {
  // Code 0 appears in the data as "no activity"; it is not a real CNAE.
  if (!code) return undefined
  return {
    code: String(code).padStart(7, "0"),
    description: text(description),
  }
}

/** Maps the Minha Receita payload onto the app's registry record. */
export function parseMinhaReceita(
  payload: MinhaReceitaCompany,
  fetchedAt = new Date()
): BusinessRegistry {
  return {
    cnpj: payload.cnpj ? normalizeCnpj(payload.cnpj) : undefined,
    fetchedAt,
    legalName: text(payload.razao_social),
    tradeName: text(payload.nome_fantasia),
    status: text(payload.descricao_situacao_cadastral),
    statusDate: text(payload.data_situacao_cadastral),
    openedAt: text(payload.data_inicio_atividade),
    size: text(payload.porte),
    legalNature: text(payload.natureza_juridica),
    mainActivity: activity(payload.cnae_fiscal, payload.cnae_fiscal_descricao),
    secondaryActivities: (payload.cnaes_secundarios ?? []).flatMap((item) => {
      const parsed = activity(item.codigo, item.descricao)
      return parsed ? [parsed] : []
    }),
    shareCapital: payload.capital_social ?? undefined,
    simples: payload.opcao_pelo_simples ?? undefined,
    mei: payload.opcao_pelo_mei ?? undefined,
    email: text(payload.email)?.toLowerCase(),
    phones: [payload.ddd_telefone_1, payload.ddd_telefone_2]
      .map((phone) => phone?.replace(/\D/g, ""))
      .filter((phone): phone is string => Boolean(phone)),
    partners: (payload.qsa ?? []).flatMap((partner) => {
      const name = text(partner.nome_socio)
      if (!name) return []
      return [
        {
          name,
          role: text(partner.qualificacao_socio),
          since: text(partner.data_entrada_sociedade),
        },
      ]
    }),
  }
}

function describeLookupFailure(status: number): string {
  if (status === 404) return "CNPJ não encontrado na base da Receita."
  if (status === 400) return "A Receita considerou o CNPJ inválido."
  if (status === 429) {
    return "A consulta à Receita foi limitada (429). Tente novamente mais tarde."
  }
  return `A consulta à Receita falhou (status ${status}).`
}

/** Never throws: a failed lookup must not fail the enrichment around it. */
export async function lookupCnpj(
  cnpj: string,
  config: CnpjLookupConfig
): Promise<CnpjLookupResult> {
  const normalized = normalizeCnpj(cnpj)
  if (!isValidCnpj(normalized)) {
    return { ok: false, error: "CNPJ inválido." }
  }

  const doFetch = config.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await doFetch(
      `${config.endpoint.replace(/\/$/, "")}/${normalized}`,
      {
        headers: {
          "User-Agent": config.userAgent,
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    )

    if (!response.ok) {
      return { ok: false, error: describeLookupFailure(response.status) }
    }

    const payload = (await response.json()) as MinhaReceitaCompany
    return { ok: true, registry: parseMinhaReceita(payload) }
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError"
    return {
      ok: false,
      error: aborted
        ? "Tempo limite excedido ao consultar a Receita."
        : "Não foi possível consultar a Receita. Tente novamente mais tarde.",
    }
  } finally {
    clearTimeout(timer)
  }
}
