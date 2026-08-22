'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-5 px-5 text-center">
      <p className="eyebrow text-destructive">Something broke</p>
      <h1 className="font-display text-4xl font-bold tracking-[-0.06em]">Unexpected error</h1>
      <p className="leading-7 text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 flex h-12 items-center gap-2 bg-primary px-6 font-bold text-primary-foreground"
      >
        Try again
      </button>
    </main>
  )
}
