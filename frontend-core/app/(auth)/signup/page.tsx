import { Suspense } from 'react'

import { AuthForm } from '@/components/auth-form'
import { RouteSkeleton } from '@/components/skeletons'

export default function SignupPage() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AuthForm mode="signup" />
    </Suspense>
  )
}
