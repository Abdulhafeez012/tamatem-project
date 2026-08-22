import { ApiError, buildApiError, NETWORK_MESSAGE } from './errors'

// --- Types (mirror the DRF serializers exactly) -----------------------------

export type LocationCode = 'JO' | 'SA'

export const LOCATIONS: LocationCode[] = ['JO', 'SA']

export function isLocationCode(value: unknown): value is LocationCode {
  return typeof value === 'string' && (LOCATIONS as string[]).includes(value)
}

export type User = {
  id: number
  username: string
  email: string
}

export type Product = {
  id: number
  title: string
  description: string
  price: string
  location: LocationCode
}

export type Order = {
  order_number: string
  product: Product
  quantity: number
  unit_price: string
  total_price: string
  status: string
  created_at: string
}

export type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// --- Endpoints --------------------------------------------------------------

/**
 * Every path lives here, exactly once, with its trailing slash.
 *
 * The slashes are not cosmetic: Django runs with APPEND_SLASH, so a GET without
 * one costs a silent 301 and a POST without one raises RuntimeError while
 * DEBUG=True.
 */
export const EP = {
  login: 'auth/login/',
  refresh: 'auth/login/refresh/',
  logout: 'auth/logout/',
  signup: 'auth/signup/',
  products: 'products/',
  product: (id: number | string) => `products/${id}/`,
  purchase: 'orders/purchase/',
  order: (orderNumber: string) => `orders/${orderNumber}/`,
} as const

/**
 * A fresh idempotency key for one purchase attempt.
 *
 * `POST orders/purchase/` requires an `Idempotency-Key` header, so this cannot
 * be allowed to fail. `crypto.randomUUID` only exists in a secure context —
 * present on localhost and HTTPS, absent when the app is served over plain HTTP
 * from something other than localhost, e.g. an IP on the local network. Without
 * the fallback, buying would throw a TypeError there instead of working.
 *
 * Collision resistance only has to hold within one user's own orders, since keys
 * are scoped per user server-side.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

const API_PREFIX = '/api/v1'

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '')

/**
 * Build an absolute API URL.
 *
 * Deliberately has no "pass through anything starting with http" escape hatch —
 * that was how absolute `localhost:8000` URLs from DRF's pagination `next`/
 * `previous` fields used to leak into client navigation.
 */
export function apiUrl(path: string, query?: Record<string, string | number | undefined>): string {
  if (!API_BASE) {
    throw new ApiError(
      0,
      'NEXT_PUBLIC_API_BASE_URL is not set. Copy .env.example to .env.local and restart the dev server.',
    )
  }

  const url = `${API_BASE}${API_PREFIX}/${path.replace(/^\/+/, '')}`

  if (!query) return url

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }

  const qs = search.toString()
  return qs ? `${url}?${qs}` : url
}

export type RequestOptions = RequestInit & {
  query?: Record<string, string | number | undefined>
}

/**
 * Perform an API request and return the parsed JSON body.
 *
 * `options.body` must be a string — `AuthProvider` replays the same options
 * after refreshing the access token, and a stream body could not be re-sent.
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
  access?: string,
): Promise<T> {
  const { query, ...init } = options

  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (access) headers.set('Authorization', `Bearer ${access}`)

  let response: Response
  try {
    response = await fetch(apiUrl(path, query), { ...init, headers })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (error instanceof ApiError) throw error
    throw new ApiError(0, NETWORK_MESSAGE, {}, error)
  }

  const text = await response.text()
  const contentType = response.headers.get('content-type') ?? ''
  const looksJson = contentType.includes('json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[')

  let body: unknown = null
  if (text && looksJson) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  } else if (text) {
    body = null
  }

  if (!response.ok) throw buildApiError(response.status, body)

  return body as T
}
