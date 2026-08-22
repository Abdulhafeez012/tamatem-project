'use client'

import { ArrowRight, LogOut, Menu, ShoppingBag, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useAuth } from '@/lib/auth'
import { ThemeToggle } from '@/components/theme-toggle'

/**
 * There is no search field here on purpose: the API exposes no search or
 * ordering parameter, and filtering the current page client-side would look
 * like search while only ever searching one page of results.
 */
export function SiteHeader() {
  const { status, user, logout } = useAuth()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // `logout` now revokes the refresh token server-side, so it is a round trip
  // rather than a local state change. Guarded against a second click, which
  // would post an already-blacklisted token and get a 400 back.
  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    setMenuOpen(false)
    try {
      await logout()
    } finally {
      router.replace('/login')
    }
  }

  return (
    <header className="site-header">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 lg:px-8">
        <Link href="/products" className="brand-mark" aria-label="Tamatem Market home">
          <span className="brand-icon">
            <ShoppingBag size={20} />
          </span>
          <span className="font-display text-2xl font-bold tracking-[-0.07em]">
            Tamatem<span className="text-accent">+</span>
          </span>
        </Link>

        <div className="flex-1" />

        <button
          type="button"
          className="md:hidden"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>

        {/* In-flow on mobile rather than absolutely positioned — the old
            `top-[72px]` offset was pinned to a search bar that no longer exists. */}
        <nav
          className={`${
            menuOpen ? 'flex' : 'hidden'
          } w-full flex-col items-start gap-1 border-t border-border/30 pt-3 md:flex md:w-auto md:flex-row md:items-center md:gap-5 md:border-0 md:pt-0`}
        >
          <Link href="/products" className="nav-link" onClick={() => setMenuOpen(false)}>
            Shop
          </Link>
          <ThemeToggle />
          {status === 'authenticated' ? (
            <>
              {user ? (
                <span className="font-mono text-xs uppercase tracking-widest opacity-70">
                  {user.username}
                </span>
              ) : null}
              <button
                type="button"
                className="nav-link flex items-center gap-2"
                onClick={signOut}
                disabled={signingOut}
              >
                <LogOut size={15} /> {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </>
          ) : (
            <Link href="/login" className="header-cta" onClick={() => setMenuOpen(false)}>
              Sign in <ArrowRight size={15} />
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
