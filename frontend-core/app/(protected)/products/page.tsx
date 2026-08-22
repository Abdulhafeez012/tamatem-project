import { Suspense } from 'react'

import { ProductsView } from './products-view'
import { ProductGridSkeleton } from '@/components/skeletons'

export default function ProductsPage() {
  // `ProductsView` calls `useSearchParams()`. Without this boundary the
  // production build fails to prerender the route — and `ignoreBuildErrors`
  // could never have hidden that, because it is a render-time failure, not a
  // type error.
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
          <ProductGridSkeleton />
        </main>
      }
    >
      <ProductsView />
    </Suspense>
  )
}
