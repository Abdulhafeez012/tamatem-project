'use client'

import { ChevronLeft, MapPin, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { EP, newIdempotencyKey, type Order, type Product } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { type ApiError, isSessionExpired, toApiError } from '@/lib/errors'
import { formatAmount, formatLocation } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { Alert, FieldErrors } from '@/components/field-errors'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/skeletons'

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const router = useRouter()
  const { request } = useAuth()

  // The route is <int:pk> on the server, so a non-numeric segment doesn't match
  // any Django route at all and comes back as an HTML 404. Catch it here rather
  // than making a request that can only fail confusingly.
  const validId = /^\d+$/.test(id)

  const { data: product, error, loading } = useApi<Product>(
    (signal) => request<Product>(EP.product(id), { signal }),
    [id],
    { enabled: validId },
  )

  const [buyError, setBuyError] = useState<ApiError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // A state flag alone is not enough: two clicks in the same tick would both
  // pass it before React re-renders. The ref closes that window.
  const inFlight = useRef(false)
  // The server-side half of the same guarantee. Generated once per attempt and
  // kept across retries, so a click that fails on a flaky connection can be
  // retried without risking a second order: the API answers the retry with the
  // order the first call created. Cleared only once an order is safely placed.
  const idempotencyKey = useRef<string | null>(null)

  const buy = async () => {
    if (!product || inFlight.current) return

    inFlight.current = true
    setSubmitting(true)
    setBuyError(null)
    idempotencyKey.current ??= newIdempotencyKey()

    try {
      // `product_id` only — quantity is fixed at 1 server-side.
      const order = await request<Order>(EP.purchase, {
        method: 'POST',
        body: JSON.stringify({ product_id: product.id }),
        headers: { 'Idempotency-Key': idempotencyKey.current },
      })
      // Placed. A later attempt is a genuinely new purchase, not a retry.
      idempotencyKey.current = null
      // Stay disabled through the navigation. Re-enabling here would let a
      // second click place a second order mid-transition.
      router.push(`/receipt/${order.order_number}`)
    } catch (caught) {
      inFlight.current = false
      setSubmitting(false)
      if (isSessionExpired(caught)) return
      // Never navigate to a receipt for an order that was not created.
      setBuyError(toApiError(caught))
    }
  }

  if (!validId) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-24">
        <h1 className="font-display text-3xl font-bold tracking-[-0.05em]">Invalid listing</h1>
        <p className="mt-4 text-muted-foreground">
          &ldquo;{id}&rdquo; is not a valid listing reference.
        </p>
        <Link href="/products" className="mt-8 inline-block underline underline-offset-4">
          Back to the marketplace
        </Link>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-8 h-14 w-full max-w-xl" />
        <Skeleton className="mt-6 h-24 w-full max-w-2xl" />
        <Skeleton className="mt-8 h-12 w-48" />
      </main>
    )
  }

  if (error || !product) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-24">
        <h1 className="font-display text-3xl font-bold tracking-[-0.05em]">Listing not found</h1>
        <p className="mt-4 text-muted-foreground">{error?.detail ?? 'This listing is unavailable.'}</p>
        <Link href="/products" className="mt-8 inline-block underline underline-offset-4">
          Back to the marketplace
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-16">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-10 flex items-center gap-2 text-sm font-bold"
      >
        <ChevronLeft size={16} /> Back
      </button>

      <div className="grid gap-10 border-y border-border py-10 md:grid-cols-[1.2fr_1fr] md:gap-16">
        <div className="flex flex-col gap-6">
          <p className="eyebrow flex items-center gap-2 text-accent">
            <MapPin size={14} /> Ships from {formatLocation(product.location)}
          </p>
          <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-[-0.07em] md:text-6xl">
            {product.title}
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            {product.description || 'No description provided.'}
          </p>

          <dl className="mt-2 grid max-w-md grid-cols-2 gap-x-8 gap-y-3 border-t border-border pt-6 font-mono text-xs uppercase tracking-widest">
            <dt className="text-muted-foreground">Listing</dt>
            <dd>#{product.id}</dd>
            <dt className="text-muted-foreground">Location</dt>
            <dd>{product.location}</dd>
          </dl>
        </div>

        <div className="flex flex-col justify-center gap-6">
          <div className="flex items-end justify-between border-y border-border py-6">
            <span className="font-mono text-3xl font-bold">{formatAmount(product.price)}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Price
            </span>
          </div>

          <Button size="xl" onClick={buy} disabled={submitting} className="w-full">
            {submitting ? 'Placing order…' : 'Buy this listing'}
            <ShoppingBag size={17} />
          </Button>

          {buyError?.fieldErrors.product_id ? (
            <FieldErrors id="buy-error" messages={buyError.fieldErrors.product_id} />
          ) : null}
          {buyError && !buyError.fieldErrors.product_id ? <Alert>{buyError.detail}</Alert> : null}

          <p className="text-center text-xs leading-5 text-muted-foreground">
            Ordering places a single unit. You will be taken to the receipt.
          </p>
        </div>
      </div>
    </main>
  )
}
