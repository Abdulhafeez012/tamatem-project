import { ArrowRight, MapPin } from 'lucide-react'
import Link from 'next/link'

import type { Product } from '@/lib/api'
import { formatAmount, formatLocation } from '@/lib/format'

/**
 * A `next/link`, not a `<button>`.
 *
 * The original wrapped the whole card in a button, which gave it one enormous
 * accessible name ("Verified listing JO Title Description Price View listing")
 * and broke middle-click / open-in-new-tab. `aria-label` keeps the announced
 * name to the product title while the visible content stays intact.
 */
export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-tile group">
      <Link
        href={`/products/${product.id}`}
        aria-label={product.title}
        className="flex h-full min-h-56 w-full flex-col gap-5 border border-border p-5 text-left transition hover:border-primary hover:bg-muted/40 md:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <MapPin size={12} /> {formatLocation(product.location)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            #{product.id}
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-end gap-3">
          {/* Title is deliberately the dominant element: display face, 2xl,
              bold, tight tracking — against a small muted body for the rest. */}
          <h3 className="font-display text-2xl font-bold leading-tight tracking-[-0.04em] text-foreground">
            {product.title}
          </h3>
          <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
            {product.description || 'No description provided.'}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="font-mono text-lg font-bold">{formatAmount(product.price)}</span>
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            View <ArrowRight size={15} />
          </span>
        </div>
      </Link>
    </article>
  )
}
