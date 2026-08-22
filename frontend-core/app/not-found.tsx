import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-5 px-5 text-center">
      <p className="eyebrow">404</p>
      <h1 className="font-display text-5xl font-bold tracking-[-0.06em]">Page not found</h1>
      <p className="leading-7 text-muted-foreground">
        That URL doesn&rsquo;t exist. The marketplace is over here.
      </p>
      <Link
        href="/products"
        className="mt-2 flex h-12 items-center gap-2 bg-primary px-6 font-bold text-primary-foreground"
      >
        Go to listings
      </Link>
    </main>
  )
}
