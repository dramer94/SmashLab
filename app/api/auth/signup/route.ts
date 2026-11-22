import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { clientKey, hashPassword, normaliseEmail, rateLimited, sameOrigin, startSession, validEmail } from "@/lib/auth"

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  if (rateLimited(`signup:${clientKey(req)}`, 5)) return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const email = normaliseEmail(String(body.email ?? ""))
  const name = String(body.name ?? "").trim().slice(0, 40)
  const password = String(body.password ?? "")
  if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  if (name.length < 2) return NextResponse.json({ error: "Enter your name (at least 2 letters)." }, { status: 400 })
  if (password.length < 8 || password.length > 200) return NextResponse.json({ error: "Use a password of at least 8 characters." }, { status: 400 })
  const exists = await prisma.slUser.findUnique({ where: { email }, select: { id: true } })
  if (exists) return NextResponse.json({ error: "There is already an account with this email. Sign in instead." }, { status: 409 })
  const user = await prisma.slUser.create({ data: { email, name, passwordHash: await hashPassword(password) } })
  await startSession(user.id)
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, isPublic: user.isPublic } })
}
