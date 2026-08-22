'use client'

import { Sparkles } from 'lucide-react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo } from 'react'

import { EP, isLocationCode, LOCATIONS, type LocationCode, type Paginated, type Product } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatLocation } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { Alert } from '@/components/field-errors'
import { PaginationControls } from '@/components/pagination-controls'
import { ProductGrid } from '@/components/product-grid'
import { ProductGridSkeleton } from '@/components/skeletons'

const PAGE_SIZE = 12

export function ProductsView() {
  const { request } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawPage = searchParams.get('page')
  const rawLocation = searchParams.get('location')

  const parsedPage = Number.parseInt(rawPage ?? '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1
  const location: LocationCode | undefined = isLocationCode(rawLocation) ? rawLocation : undefined

  // Canonicalise junk in the URL rather than letting it reach the API, where an
  // unknown `location` returns a 400 whose body is a bare string.
  const needsCanonical =
    (rawPage !== null && String(page) !== rawPage) ||
    (rawLocation !== null && location === undefined)

  const buildQuery = useCallback((nextPage: number, nextLocation?: LocationCode) => {
    const params = new URLSearchParams()
    if (nextPage > 1) params.set('page', String(nextPage))
    if (nextLocation) params.set('location', nextLocation)
    const qs = params.toString()
    return qs ? `/products?${qs}` : '/products'
  }, [])

  useEffect(() => {
    if (needsCanonical) router.replace(buildQuery(page, location))
  }, [needsCanonical, router, buildQuery, page, location])

  const { data, error, loading } = useApi<Paginated<Product>>(
    (signal) =>
      request<Paginated<Product>>(EP.products, {
        signal,
        query: { page, page_size: PAGE_SIZE, location },
      }),
    [page, location],
    { enabled: !needsCanonical },
  )

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1),
    [data],
  )

  // An out-of-range page is a 404 from DRF. Bounce to page 1, but only when we
  // aren't already there, so this can never loop.
  const outOfRange = error?.status === 404 && page !== 1
  useEffect(() => {
    if (outOfRange) router.replace(buildQuery(1, location))
  }, [outOfRange, router, buildQuery, location])

  const goToPage = (nextPage: number) => router.push(buildQuery(nextPage, location))

  // Changing the filter must reset to page 1: "All" is 9 pages but "Jordan" is
  // only 5, so filtering from page 7 would land on an Invalid page error.
  const setLocation = (nextLocation?: LocationCode) => router.push(buildQuery(1, nextLocation))

  const products = data?.results ?? []

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
      <section className="store-hero relative mb-8 grid items-center gap-8 px-7 py-10 md:grid-cols-2 md:gap-10 md:px-12 md:py-14">
        <div className="relative z-10">
          <p className="eyebrow flex items-center gap-2 text-accent">
            <Sparkles size={14} /> Tamatem marketplace
          </p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-[0.92] tracking-[-0.07em] md:text-7xl">
            Browse every
            <br />
            <span className="text-accent">listing.</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-6 opacity-75">
            Everything in the catalogue, shipping from Jordan and Saudi Arabia.
          </p>
        </div>
        <div className="relative z-10 hidden md:block">
          <div className="relative aspect-video w-full overflow-hidden">
            <Image
              src="/steam-deck.png"
              alt=""
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover object-center rounded-3xl"
            />
          </div>
        </div>
      </section>

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="category-pill"
          aria-pressed={location === undefined}
          onClick={() => setLocation(undefined)}
        >
          All locations
        </button>
        {LOCATIONS.map((code) => (
          <button
            key={code}
            type="button"
            className="category-pill"
            aria-pressed={location === code}
            onClick={() => setLocation(code)}
          >
            {formatLocation(code)}
          </button>
        ))}
      </div>

      <section className="grid gap-8 border-b border-border pb-10 md:grid-cols-[1fr_280px] md:items-end">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <Sparkles size={14} /> Catalogue
          </p>
          <h2 className="mt-4 max-w-3xl font-display text-5xl font-bold leading-[0.9] tracking-[-0.075em] text-balance md:text-7xl">
            {location ? `Shipping from ${formatLocation(location)}.` : 'Everything, in one place.'}
          </h2>
        </div>
        <div className="border-l-2 border-accent pl-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Your hub for game listings across the region.
          </p>
          <div className="mt-5 flex gap-5 font-mono text-xs uppercase tracking-widest">
            <span>{data ? `${data.count} listings` : '—'}</span>
            <span>{location ?? 'JO / SA'}</span>
          </div>
        </div>
      </section>

      {error && !outOfRange ? (
        <div className="mt-8">
          <Alert>{error.detail}</Alert>
        </div>
      ) : null}

      {loading ? (
        <ProductGridSkeleton />
      ) : products.length ? (
        <>
          <ProductGrid products={products} />
          <PaginationControls
            page={page}
            totalPages={totalPages}
            count={data?.count ?? 0}
            onPageChange={goToPage}
            busy={loading}
          />
        </>
      ) : !error ? (
        <p className="py-20 text-center text-muted-foreground">
          No listings match this filter.
        </p>
      ) : null}
    </main>
  )
}
