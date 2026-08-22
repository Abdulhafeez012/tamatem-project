'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

/**
 * The icons are swapped with `dark:` utilities rather than by reading the
 * resolved theme, so this needs no `mounted` gate and cannot hydrate wrong.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      type="button"
      className="nav-link flex items-center gap-2"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle dark mode"
    >
      <Sun size={15} className="dark:hidden" />
      <Moon size={15} className="hidden dark:block" />
    </button>
  )
}
