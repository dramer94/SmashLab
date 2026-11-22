import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { AccountClient } from "./client"

export const metadata: Metadata = { title: "Sign in", robots: { index: false } }
export const dynamic = "force-dynamic"

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/me"
  if (await getCurrentUser()) redirect(safeNext)
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-1 text-3xl font-bold text-white">Your SmashLab account</h1>
      <p className="mb-6 text-gray-400">Save your Rally Analysis stats, share results and join the weekly leaderboard.</p>
      <div className="rounded-xl border border-white/10 bg-[var(--card)] p-5">
        <AccountClient next={safeNext} />
      </div>
    </div>
  )
}
