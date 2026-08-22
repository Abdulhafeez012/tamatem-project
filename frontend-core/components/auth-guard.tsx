'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { useAuth } from '@/lib/auth'
import { RouteSkeleton } from '@/components/skeletons'

/**
 * Gates every protected route. Mounted once, in `app/(protected)/layout.tsx`.
 *
 * This has to be a component rather than a hook: a hook cannot withhold the
 * page body, and withholding it is the point. Children never mount until the
 * session is confirmed, which means no flash of protected content *and* no
 * child effect firing a request before there is a token to send.
 *
 * The same skeleton renders for both 'loading' and 'anonymous' — swapping in a
 * "Redirecting…" message would itself be a visible flash.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    }
  }, [status, pathname, router])

  if (status !== 'authenticated') return <RouteSkeleton />

  return <>{children}</>
}
