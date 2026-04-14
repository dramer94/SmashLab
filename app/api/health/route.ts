import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const playerCount = await prisma.slPlayer.count()
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      data: { players: playerCount },
    })
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 })
  }
}
