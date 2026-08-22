import type { LocationCode } from './api'

/**
 * Locales are pinned rather than left to resolve from the environment: an
 * `undefined` locale resolves to the server's during SSR and the browser's on
 * the client, which is a formatted-output hydration mismatch.
 */
const LOCALE = 'en-US'

const amountFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Format a price for display.
 *
 * No currency symbol: the API exposes no currency field at all, and products are
 * split across Jordan and Saudi Arabia, so asserting one would be inventing
 * data. See "Known limitations" in the README.
 */
export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return amountFormatter.format(amount)
}

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

const LOCATION_NAMES: Record<LocationCode, string> = {
  JO: 'Jordan',
  SA: 'Saudi Arabia',
}

export function formatLocation(code: string): string {
  return LOCATION_NAMES[code as LocationCode] ?? code
}
