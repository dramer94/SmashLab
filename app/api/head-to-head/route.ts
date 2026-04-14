import { NextRequest, NextResponse } from "next/server"
import { getPlayerBySlug, getH2HBetweenPlayers } from "@/lib/queries"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const p1Slug = searchParams.get("p1")
  const p2Slug = searchParams.get("p2")

  if (!p1Slug || !p2Slug) {
    return NextResponse.json({ error: "Both p1 and p2 query params required" }, { status: 400 })
  }

  const [player1, player2] = await Promise.all([
    getPlayerBySlug(p1Slug),
    getPlayerBySlug(p2Slug),
  ])

  if (!player1 || !player2) {
    return NextResponse.json({ error: "One or both players not found" }, { status: 404 })
  }

  const matches = await getH2HBetweenPlayers(player1.id, player2.id)

  const p1Wins = matches.filter(m => m.winnerId === player1.id).length
  const p2Wins = matches.filter(m => m.winnerId === player2.id).length

  return NextResponse.json({
    player1,
    player2,
    matches,
    summary: {
      player1Wins: p1Wins,
      player2Wins: p2Wins,
      total: matches.length,
    },
  })
}
