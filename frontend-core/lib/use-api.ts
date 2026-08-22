'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { type ApiError, isAbort, isSessionExpired, toApiError } from './errors'

type UseApiResult<T> = {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
}

/**
 * Run an authenticated fetch with cancellation.
 *
 * The `AbortController` matters twice over: React StrictMode double-invokes
 * effects in development, and — the real bug it prevents — flipping pages
 * quickly can resolve responses out of order and render a stale page.
 *
 * `SessionExpiredError` is swallowed rather than surfaced: `AuthProvider` has
 * already cleared the session, so `AuthGuard` is about to redirect, and showing
 * an error for one frame first is just a flash.
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean } = {},
): UseApiResult<T> {
  const enabled = options.enabled ?? true

  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [nonce, setNonce] = useState(0)

  // Kept in a ref so a new closure each render doesn't re-trigger the effect;
  // `deps` is the single source of truth for when to refetch.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const controller = new AbortController()
    let alive = true

    setLoading(true)
    setError(null)

    fetcherRef.current(controller.signal).then(
      (result) => {
        if (!alive) return
        setData(result)
        setLoading(false)
      },
      (caught) => {
        if (!alive || controller.signal.aborted || isAbort(caught)) return
        if (isSessionExpired(caught)) {
          setLoading(false)
          return
        }
        setData(null)
        setError(toApiError(caught))
        setLoading(false)
      },
    )

    return () => {
      alive = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, error, loading, reload }
}
