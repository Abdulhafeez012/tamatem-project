import { Suspense } from 'react'

import { AuthForm } from '@/components/auth-form'
import { RouteSkeleton } from '@/components/skeletons'

export default function LoginPage() {
  // AuthForm reads `useSearchParams()`, which needs a Suspense boundary or the
  // production build fails to prerender this route.
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AuthForm mode="login" />
    </Suspense>
  )
}
