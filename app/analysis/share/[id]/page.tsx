import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { isSession } from "@/lib/analysis/storage"
import { SharedResults } from "./client"

export const dynamic = "force-dynamic"

const load = cache(async (id: string) => {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return null
  return prisma.slSharedAnalysis.findUnique({ where: { id }, include: { user: { select: { name: true } } } })
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const row = await load((await params).id)
  return row
    ? { title: row.title, description: `Rally Analysis by ${row.user.name} on SmashLab: shots, rallies, speeds and court map.`, robots: { index: false } }
    : { title: "Not found" }
}

export default async function SharedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row || !isSession(row.data)) notFound()
  await prisma.slSharedAnalysis.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {})
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-blue-400">Rally Analysis · shared by {row.user.name}</div>
          <h1 className="mt-1 text-3xl font-bold text-white">{row.title}</h1>
          <p className="text-sm text-gray-500">{row.createdAt.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })} · results only, the video stays with the player</p>
        </div>
        <Link href="/analysis" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Analyse your own game</Link>
      </div>
      <SharedResults session={row.data} />
    </div>
  )
}
