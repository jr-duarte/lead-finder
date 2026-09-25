const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const numberFormatter = new Intl.NumberFormat("pt-BR")

export function formatDate(value?: Date | string | null): string {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date)
}

export function formatDateTime(value?: Date | string | null): string {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date)
}

export function formatNumber(value?: number | null): string {
  if (value === undefined || value === null) return "—"
  return numberFormatter.format(value)
}

export function formatRating(value?: number | null): string {
  if (value === undefined || value === null) return "—"
  return value.toFixed(1)
}

/** Strips the scheme and trailing slash so URLs fit in a table cell. */
export function formatWebsiteLabel(url?: string | null): string {
  if (!url) return "—"
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "")
}

export function formatPhone(value?: string | null): string {
  if (!value) return "—"

  const digits = value.replace(/\D/g, "")
  const local = digits.startsWith("55") ? digits.slice(2) : digits

  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }

  return value
}
