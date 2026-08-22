'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

import { useAuth } from '@/lib/auth'
import { SiteHeader } from '@/components/site-header'
import { RouteSkeleton } from '@/components/skeletons'

function safeNext(value: string | null): string {
  return value && /^\/(?!\/)/.test(value) ? value : '/products'
}

/**
 * Inverse of `AuthGuard`: an already-signed-in visitor has no business on the
 * login or signup form. Without this, pressing Back after signing in shows the
 * login page again.
 */
function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (status === 'authenticated') router.replace(safeNext(searchParams.get('next')))
  }, [status, router, searchParams])

  if (status === 'authenticated') return <RouteSkeleton />

  return <>{children}</>
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <Suspense fallback={<RouteSkeleton />}>
        <RedirectIfAuthenticated>{children}</RedirectIfAuthenticated>
      </Suspense>
    </div>
  )
}
