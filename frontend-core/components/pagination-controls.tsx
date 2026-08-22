'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Page numbers are derived from `count`, never from DRF's `next`/`previous`
 * URLs: those are absolute against the API host, so they would send the browser
 * to :8000, and numbered controls need an integer anyway.
 */
export function PaginationControls({
  page,
  totalPages,
  count,
  onPageChange,
  busy = false,
}: {
  page: number
  totalPages: number
  count: number
  onPageChange: (page: number) => void
  busy?: boolean
}) {
  if (totalPages <= 1) return null

  return (
    // Mobile uses an explicit 2-column grid so the buttons always share row 1
    // and the label spans row 2. `flex-wrap` could not guarantee that: the label
    // is wide enough to push a button onto its own line at narrow widths.
    // The grid placement classes are inert once `sm:flex` takes over.
    <nav
      aria-label="Pagination"
      className="mt-12 grid grid-cols-2 items-center gap-x-4 gap-y-4 border-t border-border pt-5 text-sm sm:flex sm:justify-between"
    >
      <Button
        variant="outline"
        size="xl"
        disabled={page <= 1 || busy}
        onClick={() => onPageChange(page - 1)}
        className="col-start-1 row-start-1 justify-self-start"
      >
        <ChevronLeft size={16} /> Previous
      </Button>

      <span className="col-span-2 row-start-2 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground sm:row-start-auto">
        Page {page} of {totalPages} · {count} listings
      </span>

      <Button
        variant="outline"
        size="xl"
        disabled={page >= totalPages || busy}
        onClick={() => onPageChange(page + 1)}
        className="col-start-2 row-start-1 justify-self-end"
      >
        Next <ChevronRight size={16} />
      </Button>
    </nav>
  )
}
