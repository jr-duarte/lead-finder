import { isValidCnpj, normalizeCnpj } from "@/domain/cnpj"

/** 14 characters with optional separators; the last two are check digits. */
const FLEXIBLE =
  "[0-9A-Z]{2}[.\\s]?[0-9A-Z]{3}[.\\s]?[0-9A-Z]{3}[/\\s]?[0-9A-Z]{4}[-\\s]?\\d{2}"

/**
 * A CNPJ right after its label, masked or not: "CNPJ: 12345678000190",
 * "CNPJ/MF nº 12.345.678/0001-90". The label is case-insensitive, the number
 * is not, so uppercase letters of the alphanumeric format do not swallow the
 * words that follow.
 */
const LABELED = new RegExp(
  `[Cc][Nn][Pp][Jj](?:\\s*/\\s*MF)?[^0-9A-Za-z]{0,6}(?:[Nn][º°o.]*\\s*)?[:\\-–]?\\s*(${FLEXIBLE})(?![0-9])`,
  "g"
)

/**
 * A fully masked number anywhere in the text. Without a label, the mask is
 * what sets it apart from phone numbers and ids.
 */
const MASKED =
  /(?<![0-9A-Za-z])([0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2})(?![0-9])/g

/** Visible text of the page, where a CNPJ is usually printed in the footer. */
function toText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ordm;|&#186;/gi, "º")
    .replace(/&#8211;|&ndash;/gi, "–")
}

/**
 * Finds the company's CNPJ in a page. Labeled numbers come first, since an
 * unlabeled one may belong to someone else (a payment provider, the agency
 * that built the site). Only numbers with valid check digits are returned.
 */
export function extractCnpjs(html: string): string[] {
  const text = toText(html)
  const found: string[] = []

  for (const pattern of [LABELED, MASKED]) {
    for (const match of text.matchAll(pattern)) {
      const cnpj = normalizeCnpj(match[1])
      if (isValidCnpj(cnpj) && !found.includes(cnpj)) found.push(cnpj)
    }
  }

  return found
}
