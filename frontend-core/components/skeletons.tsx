export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-muted ${className}`} />
}

export function ProductGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-64" />
      ))}
    </div>
  )
}

/** Placeholder shown while the session is being resolved on a protected route. */
export function RouteSkeleton() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-12 lg:px-8" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-6 h-4 w-full max-w-md" />
      <ProductGridSkeleton count={8} />
    </main>
  )
}
