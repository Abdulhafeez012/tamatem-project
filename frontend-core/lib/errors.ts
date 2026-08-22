/**
 * Error normalisation for the Tamatem API.
 *
 * The backend returns three different error shapes, and — because it runs with
 * DEBUG=True — sometimes returns HTML instead of JSON. Everything funnels
 * through `ApiError` so UI code only ever deals with one type.
 *
 *   { "detail": "..." }                            auth / 404 / 405
 *   { "password": ["too short", "too common"] }    field validation
 *   { "location": "Must be one of: JO, SA." }      bare-string outlier
 */

export const NETWORK_MESSAGE =
  'Cannot reach the API. Is the backend running on http://localhost:8000?'

/** Keys that carry a message about the request as a whole, not a single field. */
const NON_FIELD_KEYS = new Set(['detail', 'code', 'messages', 'non_field_errors'])

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server (network/CORS). */
  readonly status: number
  /** Always a non-empty, human-readable sentence. */
  readonly detail: string
  /** Per-field messages. A field may legitimately carry several. */
  readonly fieldErrors: Record<string, string[]>
  readonly raw: unknown

  constructor(
    status: number,
    detail: string,
    fieldErrors: Record<string, string[]> = {},
    raw: unknown = null,
  ) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.fieldErrors = fieldErrors
    this.raw = raw
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0
  }
}

/**
 * Thrown when the session is unrecoverable (refresh failed or already gone).
 * Pages catch this and return quietly — `AuthProvider` has already cleared the
 * session, so `AuthGuard` redirects on the next render.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.')
    this.name = 'SessionExpiredError'
  }
}

export function isSessionExpired(error: unknown): boolean {
  return error instanceof SessionExpiredError
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function fallbackForStatus(status: number): string {
  if (status === 0) return NETWORK_MESSAGE
  if (status === 400) return 'Please check the highlighted fields.'
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to do that.'
  if (status === 404) return 'Not found.'
  if (status === 409) return 'That already exists.'
  if (status >= 500) return 'Something went wrong on the server. Please try again.'
  return `Request failed (${status}).`
}

/** Coerce one field value into a list of strings. */
function toMessages(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean)
  if (typeof value === 'string') return value ? [value] : []
  if (value == null) return []
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  try {
    return [JSON.stringify(value)]
  } catch {
    return []
  }
}

/**
 * Build an `ApiError` from a status and an already-parsed body. `body` may be
 * `null` (empty response) or a string (non-JSON — e.g. Django's DEBUG HTML), in
 * which case it is discarded entirely so markup can never reach the DOM.
 */
export function buildApiError(status: number, body: unknown): ApiError {
  if (body === null || body === undefined || typeof body !== 'object') {
    return new ApiError(status, fallbackForStatus(status), {}, body)
  }

  const record = body as Record<string, unknown>
  const fieldErrors: Record<string, string[]> = {}

  for (const [key, value] of Object.entries(record)) {
    if (NON_FIELD_KEYS.has(key)) continue
    const messages = toMessages(value)
    if (messages.length) fieldErrors[key] = messages
  }

  const parts: string[] = []
  if (typeof record.detail === 'string' && record.detail) parts.push(record.detail)
  parts.push(...toMessages(record.non_field_errors))

  let detail = parts.join(' ')

  // simplejwt's message for bad credentials is accurate but unfriendly.
  if (record.code === 'no_active_account') detail = 'Incorrect username or password.'

  if (!detail) detail = fallbackForStatus(status)

  return new ApiError(status, detail, fieldErrors, body)
}

/** Coerce anything caught in a `catch` block into an `ApiError`. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof SessionExpiredError) return new ApiError(401, error.message)
  if (error instanceof Error) return new ApiError(0, error.message || NETWORK_MESSAGE, {}, error)
  return new ApiError(0, NETWORK_MESSAGE, {}, error)
}
