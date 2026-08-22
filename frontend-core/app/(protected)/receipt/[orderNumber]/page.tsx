'use client'

import { ArrowRight, Package } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { EP, type Order } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatAmount, formatDateTime, formatLocation } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { Skeleton } from '@/components/skeletons'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border py-3 last:border-b-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  )
}

export default function ReceiptPage() {
  const params = useParams<{ orderNumber: string }>()
  const orderNumber = params?.orderNumber ?? ''
  const { request } = useAuth()

  // The server route is <uuid:order_number>, so anything else never matches and
  // returns an HTML 404. Check before spending a request.
  const validUuid = UUID_PATTERN.test(orderNumber)

  /**
   * The purchase response already contains the whole order, but the receipt
   * re-fetches by order number anyway. Same serializer either way, so there is
   * no divergence risk, and it makes the route self-sufficient — a refresh or a
   * shared link still works, which passing state through would not survive.
   */
  const { data: order, error, loading } = useApi<Order>(
    (signal) => request<Order>(EP.order(orderNumber), { signal }),
    [orderNumber],
    { enabled: validUuid },
  )

  if (!validUuid) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="font-display text-3xl font-bold tracking-[-0.05em]">Invalid receipt</h1>
        <p className="mt-4 text-muted-foreground">
          &ldquo;{orderNumber}&rdquo; is not a valid order reference.
        </p>
        <Link href="/products" className="mt-8 inline-block underline underline-offset-4">
          Back to the marketplace
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-16 lg:py-24">
      <div className="border-y border-border py-10 md:border md:p-12">
        <div className="text-center">
          <div className="mx-auto mb-7 grid size-14 place-items-center bg-accent text-accent-foreground">
            <Package />
          </div>
          <p className="eyebrow text-accent">Order receipt</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.06em]">
            Order placed
          </h1>
        </div>

        {loading ? (
          <div className="mt-10 flex flex-col gap-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : error || !order ? (
          <p className="mt-8 text-center text-muted-foreground">
            {error?.detail ?? 'Order not found.'}
          </p>
        ) : (
          <>
            <div className="mt-8 flex justify-center">
              {/* Rendered verbatim. Orders are created with COMPLETED (the model
                  default); nothing transitions them afterwards, so this chip
                  reports server state rather than asserting a lifecycle. */}
              <span className="status-chip">{order.status}</span>
            </div>

            <dl className="mt-8">
              <Row
                label="Order number"
                value={<span className="font-mono text-xs break-all">{order.order_number}</span>}
              />
              <Row label="Item" value={order.product.title} />
              <Row label="Ships from" value={formatLocation(order.product.location)} />
              <Row label="Quantity" value={order.quantity} />
              <Row label="Unit price" value={formatAmount(order.unit_price)} />
              <Row
                label="Total"
                value={<span className="font-mono text-lg font-bold">{formatAmount(order.total_price)}</span>}
              />
              <Row label="Placed" value={formatDateTime(order.created_at)} />
            </dl>

            {order.product.description ? (
              <p className="mt-6 text-sm leading-6 text-muted-foreground">
                {order.product.description}
              </p>
            ) : null}
          </>
        )}

        <Link
          href="/products"
          className="mt-10 flex h-12 w-full items-center justify-center gap-2 bg-primary font-bold text-primary-foreground transition hover:bg-accent hover:text-accent-foreground"
        >
          Continue browsing <ArrowRight size={16} />
        </Link>
      </div>
    </main>
  )
}
