import { NextResponse } from "next/server"
import { getPlayerBySlug, getPlayerStats, getPlayerH2HRecords, getFormTrend } from "@/lib/queries"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const player = await getPlayerBySlug(slug)
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 })
  }

  const [stats, h2h, form] = await Promise.all([
    getPlayerStats(player.id),
    getPlayerH2HRecords(player.id),
    getFormTrend(player.id),
  ])

  return NextResponse.json({ player, stats, h2h, form })
}
