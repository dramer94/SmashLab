"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Zap, Menu, X, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/players", label: "Players" },
  { href: "/countries", label: "Countries" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/stats", label: "Records" },
  { href: "/generations", label: "Generations" },
  { href: "/head-to-head", label: "H2H" },
  { href: "/olympics", label: "Olympics" },
  { href: "/team-cups", label: "Team Cups" },
  { href: "/analysis", label: "Rally Analysis" },
]

/** "Sign in" or the signed-in player's name, linking to their profile. */
function useAccountName() {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    const load = () =>
      fetch("/api/auth/me")
        .then((r) => (r.ok ? r.json() : { user: null }))
        .then((d) => setName(d.user?.name ?? null))
        .catch(() => setName(null))
    load()
    window.addEventListener("smashlab:auth", load)
    return () => window.removeEventListener("smashlab:auth", load)
  }, [])
  return name
}

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const accountName = useAccountName()
  const accountHref = accountName ? "/me" : "/account?next=/analysis"
  const accountLabel = accountName ? (accountName.length > 14 ? `${accountName.slice(0, 13)}…` : accountName) : "Sign in"

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <Zap className="h-6 w-6 text-[var(--primary)] transition-colors group-hover:text-[var(--accent)]" />
          <span className="text-xl font-bold text-[var(--foreground)]">
            Smash<span className="text-[var(--primary)]">Lab</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden lg:flex lg:items-center lg:gap-0.5 xl:gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2 py-2 text-sm font-medium xl:px-3 text-[var(--foreground-muted)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={accountHref}
            className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)]"
          >
            <UserRound className="h-4 w-4" /> {accountLabel}
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-[var(--foreground-muted)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] lg:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out lg:hidden",
          mobileOpen ? "max-h-[32rem]" : "max-h-0"
        )}
      >
        <div className="space-y-1 px-4 pb-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-md px-3 py-2 text-base font-medium text-[var(--foreground-muted)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={accountHref}
            className="block rounded-md px-3 py-2 text-base font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)]"
            onClick={() => setMobileOpen(false)}
          >
            {accountName ? `My profile (${accountLabel})` : "Sign in"}
          </Link>
        </div>
      </div>
    </nav>
  )
}
