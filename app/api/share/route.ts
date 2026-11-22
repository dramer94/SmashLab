import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser, sameOrigin } from "@/lib/auth"
import { isSession } from "@/lib/analysis/storage"

/** A 5-minute doubles analysis is ~180 KB of JSON (Postgres compresses it further). */
const MAX_BYTES = 400_000
const PER_USER = 50
/** Site-wide cap so shares can never crowd the shared database (512 MB Neon plan). */
const SITE_LIMIT = Number(process.env.SHARE_LIMIT) || 1000

/** Publish a read-only results page (no video) and return its id. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Sign in to share." }, { status: 401 })
  const text = await req.text()
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "This analysis is too big to share. Analyse a shorter part of the video." }, { status: 413 })
  let body: { title?: unknown; data?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 })
  }
  if (!isSession(body.data)) return NextResponse.json({ error: "That is not a rally analysis." }, { status: 400 })
  const [mine, all] = await Promise.all([
    prisma.slSharedAnalysis.count({ where: { userId: me.id } }),
    prisma.slSharedAnalysis.count(),
  ])
  if (mine >= PER_USER) return NextResponse.json({ error: `You have ${PER_USER} shared links. Delete some on your profile first.` }, { status: 400 })
  if (all >= SITE_LIMIT) return NextResponse.json({ error: "Sharing is full right now. Try again later." }, { status: 503 })
  const title = (typeof body.title === "string" ? body.title : "Rally analysis").trim().slice(0, 100) || "Rally analysis"
  const id = randomBytes(9).toString("base64url")
  await prisma.slSharedAnalysis.create({ data: { id, userId: me.id, title, data: body.data as object } })
  return NextResponse.json({ id })
}
