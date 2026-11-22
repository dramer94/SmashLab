import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser, sameOrigin } from "@/lib/auth"
import { parsePlayStat } from "@/lib/analysis/profile"

export const dynamic = "force-dynamic"

export async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  const stats = await prisma.slPlayStat.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 500 })
  return NextResponse.json({ stats })
}

/** Save (or update) the stats of one analysed video for the signed-in player. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  const stat = parsePlayStat((await req.json().catch(() => ({}))) as Record<string, unknown>)
  if (!stat) return NextResponse.json({ error: "Those stats look wrong." }, { status: 400 })
  const count = await prisma.slPlayStat.count({ where: { userId: me.id } })
  if (count >= 2000) return NextResponse.json({ error: "Your profile is full. Delete some older videos first." }, { status: 400 })
  const saved = await prisma.slPlayStat.upsert({
    where: { userId_analysisId: { userId: me.id, analysisId: stat.analysisId } },
    create: { ...stat, userId: me.id },
    update: stat,
  })
  return NextResponse.json({ stat: saved })
}
