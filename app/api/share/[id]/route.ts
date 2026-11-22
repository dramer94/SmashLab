import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser, sameOrigin } from "@/lib/auth"

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  const { id } = await params
  await prisma.slSharedAnalysis.deleteMany({ where: { id, userId: me.id } })
  return NextResponse.json({ ok: true })
}
