import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { ProfileClient } from "./client"

export const metadata: Metadata = { title: "My profile", robots: { index: false } }
export const dynamic = "force-dynamic"

export default async function MePage() {
  const me = await getCurrentUser()
  if (!me) redirect("/account?next=/me")
  const [stats, shares] = await Promise.all([
    prisma.slPlayStat.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.slSharedAnalysis.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, views: true, createdAt: true },
      take: 200,
    }),
  ])
  return (
    <ProfileClient
      user={me}
      stats={stats.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(), shotTypes: s.shotTypes as Record<string, number> }))}
      shares={shares.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))}
    />
  )
}
