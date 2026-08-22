'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { useAuth } from '@/lib/auth'
import { ApiError, toApiError } from '@/lib/errors'
import { Alert, FieldErrors } from '@/components/field-errors'
import { Button } from '@/components/ui/button'

/** Only allow same-origin relative paths back through `?next=`. */
function safeNext(value: string | null): string {
  if (!value) return '/products'
  return /^\/(?!\/)/.test(value) ? value : '/products'
}

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const isSignup = mode === 'signup'
  const { login, signup } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirm_password: '',
  })
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value }))
    // Clear this field's server errors as soon as the user edits it.
    setError((previous) => {
      if (!previous?.fieldErrors[field]) return previous
      const { [field]: _removed, ...rest } = previous.fieldErrors
      return new ApiError(previous.status, previous.detail, rest, previous.raw)
    })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    // Confirm-password is checked here because it is purely a client concern.
    // The actual password rules are Django's and stay Django's — reimplementing
    // its four validators would only drift.
    if (isSignup && form.password !== form.confirm_password) {
      setError(new ApiError(400, 'Please check the highlighted fields.', {
        confirm_password: ['Passwords do not match.'],
      }))
      return
    }

    setBusy(true)
    setError(null)

    try {
      if (isSignup) {
        await signup(form.username, form.email, form.password, form.confirm_password)
      } else {
        await login(form.username, form.password)
      }
      router.replace(safeNext(searchParams.get('next')))
    } catch (caught) {
      const apiError = toApiError(caught)
      // A signup conflict is really a username collision, so show it on the field.
      if (isSignup && apiError.status === 409 && !apiError.hasFieldErrors) {
        setError(new ApiError(409, apiError.detail, { username: [apiError.detail] }, apiError.raw))
      } else {
        setError(apiError)
      }
      setBusy(false)
    }
  }

  const fieldErrors = error?.fieldErrors ?? {}
  const expired = searchParams.get('reason') === 'expired'

  return (
    <main className="mx-auto grid min-h-[calc(100vh-81px)] max-w-7xl items-center px-5 py-12 lg:grid-cols-[1fr_420px] lg:gap-24 lg:px-8">
      <div className="hidden lg:block">
        <p className="eyebrow">Tamatem Market</p>
        <h1 className="mt-5 max-w-2xl font-display text-7xl font-bold leading-[0.9] tracking-[-0.075em]">
          A marketplace
          <br />
          <span className="text-primary">built on</span>
          <br />
          plain listings.
        </h1>
        <p className="mt-8 max-w-md text-base leading-7 text-muted-foreground">
          Browse the catalogue, open a listing, and place an order in a couple of clicks.
        </p>
      </div>

      <div className="border-y border-border py-8 md:border md:p-10">
        <div className="mb-8">
          <p className="eyebrow text-accent">{isSignup ? 'Create an account' : 'Welcome back'}</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.06em]">
            {isSignup ? 'Join the marketplace' : 'Sign in to shop'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {isSignup
              ? 'You need an account to browse listings and place orders.'
              : 'Listings and orders require an authenticated session.'}
          </p>
        </div>

        {expired && !error ? (
          <div className="mb-4">
            <Alert tone="notice">Your session expired. Please sign in again.</Alert>
          </div>
        ) : null}

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {isSignup ? (
            <label className="field-label">
              Email
              <input
                required
                type="email"
                name="email"
                autoComplete="email"
                value={form.email}
                onChange={update('email')}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              />
              <FieldErrors id="email-error" messages={fieldErrors.email} />
            </label>
          ) : null}

          <label className="field-label">
            Username
            <input
              required
              name="username"
              autoComplete="username"
              value={form.username}
              onChange={update('username')}
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={fieldErrors.username ? 'username-error' : undefined}
            />
            <FieldErrors id="username-error" messages={fieldErrors.username} />
          </label>

          <label className="field-label">
            Password
            <input
              required
              type="password"
              name="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={update('password')}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            />
            <FieldErrors id="password-error" messages={fieldErrors.password} />
          </label>

          {isSignup ? (
            <label className="field-label">
              Confirm password
              <input
                required
                type="password"
                name="confirm_password"
                autoComplete="new-password"
                value={form.confirm_password}
                onChange={update('confirm_password')}
                aria-invalid={Boolean(fieldErrors.confirm_password)}
                aria-describedby={fieldErrors.confirm_password ? 'confirm-error' : undefined}
              />
              <FieldErrors id="confirm-error" messages={fieldErrors.confirm_password} />
            </label>
          ) : null}

          {/* Only show the summary when there is nothing more specific, so the
              same message never appears twice. */}
          {error && !error.hasFieldErrors ? <Alert>{error.detail}</Alert> : null}

          <Button type="submit" size="xl" disabled={busy} className="mt-2 w-full">
            {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Continue'}
            <ArrowRight size={16} />
          </Button>
        </form>

        <Link
          href={isSignup ? '/login' : '/signup'}
          className="mt-7 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {isSignup ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </Link>
      </div>
    </main>
  )
}
