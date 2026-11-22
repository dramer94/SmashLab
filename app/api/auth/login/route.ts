import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { clientKey, normaliseEmail, rateLimited, sameOrigin, startSession, verifyPassword } from "@/lib/auth"

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const email = normaliseEmail(String(body.email ?? ""))
  if (rateLimited(`login:${clientKey(req)}`, 10) || rateLimited(`login:${email}`, 10)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 })
  }
  const user = await prisma.slUser.findUnique({ where: { email } })
  const ok = user ? await verifyPassword(String(body.password ?? ""), user.passwordHash) : false
  if (!user || !ok) return NextResponse.json({ error: "Wrong email or password." }, { status: 401 })
  await startSession(user.id)
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, isPublic: user.isPublic } })
}
