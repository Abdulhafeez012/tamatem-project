'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { apiRequest, EP, type RequestOptions, type User } from './api'
import { SessionExpiredError, toApiError } from './errors'

export type Session = {
  access: string
  refresh: string
  user: User
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type AuthContextValue = {
  status: AuthStatus
  user: User | null
  login: (username: string, password: string) => Promise<void>
  signup: (
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
  ) => Promise<void>
  /**
   * Revokes the refresh token server-side, then clears the local session. The
   * local session is cleared even if the revocation call fails.
   */
  logout: () => Promise<void>
  /**
   * Authenticated request. Retries once through a shared refresh on 401 and
   * throws `SessionExpiredError` when the session is unrecoverable.
   *
   * `options.body` must be a string so the retry can replay it.
   */
  request: <T = unknown>(path: string, options?: RequestOptions) => Promise<T>
}

const STORAGE_KEY = 'market_session'

const AuthContext = createContext<AuthContextValue | null>(null)

/** Read a JWT's `exp` without verifying it — we only need to know if it is dead. */
function jwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const claims = JSON.parse(atob(padded)) as { exp?: unknown }
    return typeof claims.exp === 'number' ? claims.exp : null
  } catch {
    return null
  }
}

function isDead(token: string): boolean {
  const exp = jwtExpiry(token)
  return exp !== null && exp * 1000 <= Date.now()
}

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session> | null
    if (!parsed?.access || !parsed.refresh || !parsed.user) return null
    // The refresh window never extends, so an expired refresh means the whole
    // session is unusable. Starting anonymous beats booting in and 401-ing.
    if (isDead(parsed.refresh)) return null
    return parsed as Session
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  // The ref is authoritative. Reading the session from render scope inside
  // `request` would capture a stale value across refreshes and logout.
  const sessionRef = useRef<Session | null>(null)
  const refreshing = useRef<Promise<Session> | null>(null)

  const apply = useCallback((next: Session | null) => {
    sessionRef.current = next
    setUser(next?.user ?? null)
    setStatus(next ? 'authenticated' : 'anonymous')
  }, [])

  const save = useCallback(
    (next: Session | null) => {
      apply(next)
      try {
        if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        else localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* private mode / storage disabled — session stays in memory only */
      }
    },
    [apply],
  )

  // Hydrate once. `status` starts as 'loading' on both server and first client
  // render, so nothing here can cause a hydration mismatch.
  useEffect(() => {
    const stored = readStoredSession()
    if (stored) apply(stored)
    else save(null)
  }, [apply, save])

  // Signing out in one tab signs out the others. Uses `apply`, not `save`, so
  // tabs don't write the same value back and forth.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return
      apply(readStoredSession())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [apply])

  /**
   * Single-flight refresh. Concurrent 401s share one network call — important
   * because ROTATE_REFRESH_TOKENS is on, so spending the same refresh token
   * twice would invalidate a live session.
   */
  const doRefresh = useCallback((): Promise<Session> => {
    if (refreshing.current) return refreshing.current

    const run = (async () => {
      const current = sessionRef.current
      if (!current) throw new SessionExpiredError()

      try {
        const data = await apiRequest<{ access: string; refresh?: string }>(EP.refresh, {
          method: 'POST',
          body: JSON.stringify({ refresh: current.refresh }),
        })

        // If logout landed while this was in flight, do not resurrect it.
        const base = sessionRef.current
        if (!base) throw new SessionExpiredError()

        const next: Session = {
          ...base,
          access: data.access,
          // ROTATE_REFRESH_TOKENS=True means a new refresh comes back too.
          // Dropping it is what used to shorten sessions.
          refresh: data.refresh ?? base.refresh,
        }
        save(next)
        return next
      } catch {
        save(null)
        throw new SessionExpiredError()
      } finally {
        refreshing.current = null
      }
    })()

    refreshing.current = run
    return run
  }, [save])

  // Stable identity: effects may list `request` in their deps without looping.
  const request = useCallback(
    async <T,>(path: string, options: RequestOptions = {}): Promise<T> => {
      const current = sessionRef.current
      if (!current) throw new SessionExpiredError()

      try {
        return await apiRequest<T>(path, options, current.access)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error
        const apiError = toApiError(error)
        if (apiError.status !== 401) throw apiError
        const next = await doRefresh()
        return apiRequest<T>(path, options, next.access)
      }
    },
    [doRefresh],
  )

  // Auth calls deliberately bypass `request`: they carry no token, and a 401
  // here means bad credentials, not an expired session.
  const login = useCallback(
    async (username: string, password: string) => {
      const session = await apiRequest<Session>(EP.login, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      save(session)
    },
    [save],
  )

  const signup = useCallback(
    async (username: string, email: string, password: string, confirmPassword: string) => {
      const session = await apiRequest<Session>(EP.signup, {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password,
          confirm_password: confirmPassword,
        }),
      })
      save(session)
    },
    [save],
  )

  /**
   * Revoke the refresh token server-side, then clear the local session.
   *
   * The local session is cleared in a `finally`: if the network call fails the
   * user must still end up signed out on this device. The alternative — leaving
   * them signed in because a request failed — is the worse outcome, since the
   * intent to leave was explicit.
   *
   * Deliberately not routed through `request()`. That would refresh-and-replay
   * on a 401, minting a *new* refresh token on the way out of the door.
   */
  const logout = useCallback(async () => {
    const current = sessionRef.current
    refreshing.current = null

    try {
      if (current) {
        await apiRequest(
          EP.logout,
          { method: 'POST', body: JSON.stringify({ refresh: current.refresh }) },
          current.access,
        )
      }
    } catch {
      // Expired access token, already-revoked refresh token, server down. None
      // of it changes what happens next.
    } finally {
      save(null)
    }
  }, [save])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, signup, logout, request }),
    [status, user, login, signup, logout, request],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
