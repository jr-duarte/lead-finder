import {
  BUSINESS_STATUS_LABELS,
  OPERATIONAL_STATUS_LABELS,
  type Business,
} from "@/domain/business"
import { formatCnpj, normalizeCnpj } from "@/domain/cnpj"
import { getEnv } from "@/lib/env"
import {
  businessRepository,
  type Paginated,
} from "@/repositories/business.repository"
import { noteRepository } from "@/repositories/note.repository"
import { pipelineRepository } from "@/repositories/pipeline.repository"
import { lookupCnpj } from "@crawler/lookups/cnpj.lookup"
import type {
  BusinessCreateInput,
  BusinessFilters,
  BusinessUpdateInput,
} from "@/schemas/business"

/** ISO date without the time part, for spreadsheet-friendly columns. */
function isoDay(value?: Date | string | null): string {
  if (!value) return ""
  const date = typeof value === "string" ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10)
}

function operationalLabel(business: Business): string {
  if (!business.operationalStatus) return ""
  return OPERATIONAL_STATUS_LABELS[business.operationalStatus]
}

/**
 * Looks a CNPJ up at the Receita and returns the fields to store. A failure
 * keeps the earlier record only when it belongs to the same CNPJ; a record
 * for a different company would be misleading.
 */
async function registryPatch(
  cnpj: string,
  current?: Business | null
): Promise<Record<string, unknown>> {
  const env = getEnv()
  if (!env.CNPJ_LOOKUP_ENDPOINT) return {}

  const result = await lookupCnpj(cnpj, {
    endpoint: env.CNPJ_LOOKUP_ENDPOINT,
    timeoutMs: env.CRAWLER_TIMEOUT_MS,
    userAgent: env.CRAWLER_USER_AGENT,
  })

  if (result.ok) return { registry: result.registry }
  if (current?.registry?.cnpj === cnpj) {
    return { "registry.error": result.error }
  }
  return { registry: { cnpj, error: result.error } }
}

export const businessService = {
  list(filters: BusinessFilters): Promise<Paginated<Business>> {
    return businessRepository.list(filters)
  },

  /** Creates a lead typed in by the user, optionally putting it on the board. */
  async create(input: BusinessCreateInput): Promise<Business> {
    const { instagram, email, addToPipeline, cnpj, ...rest } = input
    const normalizedCnpj = cnpj ? normalizeCnpj(cnpj) : undefined

    let business = await businessRepository.create({
      ...rest,
      cnpj: normalizedCnpj,
      enrichment: {
        emails: email ? [email] : [],
        socials: instagram ? { instagram } : {},
        technologies: [],
      },
    })

    if (normalizedCnpj) {
      business =
        (await businessRepository.update(
          business.id,
          await registryPatch(normalizedCnpj)
        )) ?? business
    }

    if (addToPipeline) {
      await pipelineRepository.add([business.id], "NEW")
      return (await businessRepository.findById(business.id)) ?? business
    }

    return business
  },

  getById(id: string): Promise<Business | null> {
    return businessRepository.findById(id)
  },

  /**
   * Maps the flat form payload onto the nested document shape. Instagram is
   * stored inside enrichment.socials, so it is lifted out of the flat input.
   */
  async update(
    id: string,
    input: BusinessUpdateInput
  ): Promise<Business | null> {
    const { instagram, address, cnpj, ...rest } = input

    const patch: Record<string, unknown> = { ...rest }

    if (cnpj !== undefined) {
      const normalized = cnpj ? normalizeCnpj(cnpj) : undefined
      patch.cnpj = normalized

      if (!normalized) {
        // The record describes the CNPJ that was just removed.
        patch.registry = undefined
      } else {
        const current = await businessRepository.findById(id)
        // Looked up only when it changed or was never fetched, so saving
        // other fields does not hit the Receita every time.
        if (current?.cnpj !== normalized || !current.registry?.fetchedAt) {
          Object.assign(patch, await registryPatch(normalized, current))
        }
      }
    }

    if (address) {
      for (const [key, value] of Object.entries(address)) {
        patch[`address.${key}`] = value
      }
    }

    if (instagram !== undefined) {
      patch["enrichment.socials.instagram"] = instagram || undefined
    }

    // The "not working" verdict was about the old address; the next
    // enrichment judges the new one.
    if (rest.website !== undefined) {
      const current = await businessRepository.findById(id)
      if ((current?.website ?? "") !== rest.website) {
        patch["enrichment.websiteBroken"] = undefined
      }
    }

    return businessRepository.update(id, patch)
  },

  async deleteMany(ids: string[]): Promise<number> {
    // Notes belong to the business, so they go with it.
    await noteRepository.removeByBusiness(ids)
    return businessRepository.deleteMany(ids)
  },

  async filterOptions(): Promise<{
    categories: string[]
    cities: string[]
    states: string[]
    countries: string[]
  }> {
    const [categories, cities, states, countries] = await Promise.all([
      businessRepository.distinctValues("category"),
      businessRepository.distinctValues("address.city"),
      businessRepository.distinctValues("address.state"),
      businessRepository.countries(),
    ])

    return { categories, cities, states, countries }
  },

  /** CSV export of the current filter selection (all matching pages). */
  async exportCsv(filters: BusinessFilters): Promise<string> {
    const { items } = await businessRepository.list({
      ...filters,
      page: 1,
      pageSize: 5000,
    })

    /**
     * Every column the system stores, so the export is a complete handoff to
     * a CRM or spreadsheet rather than a summary.
     */
    const columns: { header: string; value: (b: Business) => unknown }[] = [
      { header: "Nome", value: (b) => b.name },
      { header: "CNPJ", value: (b) => formatCnpj(b.cnpj) },
      { header: "Razao social", value: (b) => b.registry?.legalName },
      { header: "Nome fantasia", value: (b) => b.registry?.tradeName },
      {
        header: "Situacao cadastral",
        value: (b) => b.registry?.status,
      },
      { header: "Porte", value: (b) => b.registry?.size },
      {
        header: "CNAE principal",
        value: (b) =>
          b.registry?.mainActivity
            ? [
                b.registry.mainActivity.code,
                b.registry.mainActivity.description,
              ]
                .filter(Boolean)
                .join(" - ")
            : undefined,
      },
      { header: "Data de abertura", value: (b) => b.registry?.openedAt },
      { header: "Email (Receita)", value: (b) => b.registry?.email },
      {
        header: "Telefones (Receita)",
        value: (b) => b.registry?.phones.join("; "),
      },
      {
        header: "Socios",
        value: (b) =>
          b.registry?.partners
            .map((p) => (p.role ? `${p.name} (${p.role})` : p.name))
            .join("; "),
      },
      { header: "Categoria", value: (b) => b.category },
      { header: "Tipo (Google)", value: (b) => b.primaryType },
      { header: "Situacao", value: (b) => operationalLabel(b) },
      { header: "Telefone", value: (b) => b.phone },
      { header: "WhatsApp", value: (b) => b.enrichment.socials.whatsapp },
      { header: "Emails", value: (b) => b.enrichment.emails.join("; ") },
      { header: "Website", value: (b) => b.website },
      { header: "Instagram", value: (b) => b.enrichment.socials.instagram },
      { header: "Facebook", value: (b) => b.enrichment.socials.facebook },
      { header: "LinkedIn", value: (b) => b.enrichment.socials.linkedin },
      { header: "Rating", value: (b) => b.rating },
      { header: "Avaliacoes", value: (b) => b.reviewsCount ?? 0 },
      { header: "Rua", value: (b) => b.address.street },
      { header: "Numero", value: (b) => b.address.number },
      { header: "Bairro", value: (b) => b.address.neighborhood },
      { header: "Cidade", value: (b) => b.address.city },
      { header: "Estado", value: (b) => b.address.state },
      { header: "CEP", value: (b) => b.address.postalCode },
      { header: "Endereco completo", value: (b) => b.address.formatted },
      { header: "Latitude", value: (b) => b.location.latitude },
      { header: "Longitude", value: (b) => b.location.longitude },
      { header: "Google Maps", value: (b) => b.mapsUrl },
      { header: "Status", value: (b) => BUSINESS_STATUS_LABELS[b.status] },
      {
        header: "Tecnologias",
        value: (b) => b.enrichment.technologies.join("; "),
      },
      {
        header: "Titulo do site",
        value: (b) => b.enrichment.websiteTitle,
      },
      {
        header: "Site fora do ar",
        value: (b) =>
          b.enrichment.websiteBroken === undefined
            ? undefined
            : b.enrichment.websiteBroken
              ? "Sim"
              : "Nao",
      },
      {
        header: "Erro do enriquecimento",
        value: (b) => b.enrichment.error,
      },
      {
        header: "Data do enriquecimento",
        value: (b) => isoDay(b.enrichment.enrichedAt),
      },
      { header: "Data da coleta", value: (b) => isoDay(b.collectedAt) },
      { header: "Fonte", value: (b) => b.source },
    ]

    /**
     * Spreadsheets execute a cell starting with =, +, - or @, so scraped text
     * is prefixed with a quote. Numbers and phone numbers are exempt: they
     * legitimately start with - or +, and quoting them would corrupt the data.
     */
    const escape = (value: unknown): string => {
      if (value === undefined || value === null) return '""'

      let text = String(value)
      const isNumeric = /^[+-]?\d[\d\s().-]*$/.test(text)

      if (!isNumeric && /^[=+\-@\t\r]/.test(text)) {
        text = `'${text}`
      }

      return `"${text.replace(/"/g, '""')}"`
    }

    const rows = items.map((business) =>
      columns.map((column) => escape(column.value(business))).join(",")
    )

    return [columns.map((c) => escape(c.header)).join(","), ...rows].join("\n")
  },
}
