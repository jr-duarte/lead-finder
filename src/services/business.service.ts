import {
  BUSINESS_STATUS_LABELS,
  OPERATIONAL_STATUS_LABELS,
  type Business,
} from "@/domain/business"
import {
  businessRepository,
  type Paginated,
} from "@/repositories/business.repository"
import type { BusinessFilters, BusinessUpdateInput } from "@/schemas/business"

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

export const businessService = {
  list(filters: BusinessFilters): Promise<Paginated<Business>> {
    return businessRepository.list(filters)
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
    const { instagram, address, ...rest } = input

    const patch: Record<string, unknown> = { ...rest }

    if (address) {
      for (const [key, value] of Object.entries(address)) {
        patch[`address.${key}`] = value
      }
    }

    if (instagram !== undefined) {
      patch["enrichment.socials.instagram"] = instagram || undefined
    }

    return businessRepository.update(id, patch)
  },

  deleteMany(ids: string[]): Promise<number> {
    return businessRepository.deleteMany(ids)
  },

  async filterOptions(): Promise<{
    categories: string[]
    cities: string[]
    states: string[]
  }> {
    const [categories, cities, states] = await Promise.all([
      businessRepository.distinctValues("category"),
      businessRepository.distinctValues("address.city"),
      businessRepository.distinctValues("address.state"),
    ])

    return { categories, cities, states }
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
