import Link from "next/link"
import { Zap } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--background)]">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-8 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-sm text-[var(--foreground-muted)]">
            SmashLab — Malaysian Badminton Analytics
          </span>
        </div>

        <div className="text-sm text-[var(--foreground-muted)]">
          Part of the{" "}
          <Link
            href="https://vacabc.my"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--primary)] hover:text-[var(--accent)] transition-colors"
          >
            vacabc.my
          </Link>{" "}
          ecosystem
        </div>
      </div>
    </footer>
  )
}
