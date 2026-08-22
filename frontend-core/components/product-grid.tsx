import type { Product } from '@/lib/api'
import { ProductCard } from '@/components/product-card'

/** CSS Grid, one column on mobile scaling up to four on wide desktops. */
export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
