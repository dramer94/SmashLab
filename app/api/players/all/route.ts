import { NextResponse } from "next/server"
import { getAllPlayers } from "@/lib/queries"

export async function GET() {
  const players = await getAllPlayers()
  return NextResponse.json(players)
}
