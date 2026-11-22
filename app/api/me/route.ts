import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { endSession, getCurrentUser, sameOrigin } from "@/lib/auth"

/** Update display name / leaderboard visibility. */
export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data: { name?: string; isPublic?: boolean } = {}
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 40)
    if (name.length < 2) return NextResponse.json({ error: "Name needs at least 2 letters." }, { status: 400 })
    data.name = name
  }
  if (typeof body.isPublic === "boolean") data.isPublic = body.isPublic
  const user = await prisma.slUser.update({ where: { id: me.id }, data, select: { id: true, name: true, email: true, isPublic: true } })
  return NextResponse.json({ user })
}

/** Deletes the account and everything saved with it (stats, share links). */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  await endSession()
  await prisma.slUser.delete({ where: { id: me.id } })
  return NextResponse.json({ ok: true })
}
