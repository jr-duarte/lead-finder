/**
 * CNPJ helpers. Pure functions shared by the crawler, the API schemas and the
 * UI.
 *
 * Since July 2026 the Receita also issues alphanumeric CNPJs: the first 12
 * characters may be A-Z, the last two stay numeric check digits. The check
 * digit algorithm is the same, with each character worth its ASCII code
 * minus 48, which keeps the numeric case unchanged.
 */

const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const SECOND_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

/** Keeps only the characters a CNPJ is made of, uppercased. */
export function normalizeCnpj(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "")
}

function checkDigit(base: string, weights: number[]): number {
  const sum = weights.reduce(
    (total, weight, index) => total + (base.charCodeAt(index) - 48) * weight,
    0
  )
  const rest = sum % 11
  return rest < 2 ? 0 : 11 - rest
}

/** Validates the format and both check digits, masked or not. */
export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeCnpj(value)

  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false
  // Repeated characters pass the check digits but are never real.
  if (/^(.)\1+$/.test(cnpj)) return false

  const first = checkDigit(cnpj.slice(0, 12), FIRST_WEIGHTS)
  const second = checkDigit(cnpj.slice(0, 13), SECOND_WEIGHTS)

  return cnpj.endsWith(`${first}${second}`)
}

/** 12.345.678/0001-90; anything that is not a full CNPJ is returned as is. */
export function formatCnpj(value?: string | null): string {
  if (!value) return ""

  const cnpj = normalizeCnpj(value)
  if (cnpj.length !== 14) return value

  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
}
