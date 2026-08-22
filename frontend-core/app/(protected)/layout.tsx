'use client'

import { AuthGuard } from '@/components/auth-guard'
import { SiteHeader } from '@/components/site-header'

/**
 * Every route in this group is behind the token. Declaring the guard once here
 * — rather than per page — is what lets an expired session anywhere in the app
 * redirect on its own: `AuthProvider` clears the session, `status` flips to
 * 'anonymous', and this guard takes over.
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <AuthGuard>{children}</AuthGuard>
    </div>
  )
}
