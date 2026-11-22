import { NextResponse } from "next/server"
import { endSession, sameOrigin } from "@/lib/auth"

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  await endSession()
  return NextResponse.json({ ok: true })
}
