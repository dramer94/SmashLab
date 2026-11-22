import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

export const SESSION_COOKIE = "sl_session"
const SESSION_DAYS = 30

export interface CurrentUser {
  id: string
  email: string
  name: string
  isPublic: boolean
}

/** "scrypt$<salt b64>$<hash b64>" */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltB64, hashB64] = stored.split("$")
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, "base64")
  const got = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length)
  return got.length === expected.length && timingSafeEqual(got, expected)
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

/** Creates a session row and sets the cookie. */
export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5)
  await prisma.slAuthSession.create({ data: { tokenHash: sha256(token), userId, expiresAt } })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  })
}

export async function endSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await prisma.slAuthSession.deleteMany({ where: { tokenHash: sha256(token) } })
  jar.delete(SESSION_COOKIE)
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const s = await prisma.slAuthSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, email: true, name: true, isPublic: true } } },
    })
    if (!s || s.expiresAt < new Date()) return null
    return s.user
  } catch {
    return null
  }
}

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase()
}

export function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200
}

/* Simple per-process rate limit for sign-in attempts (one pm2 instance). */
const attempts = new Map<string, { n: number; reset: number }>()
export function rateLimited(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now()
  const a = attempts.get(key)
  if (!a || a.reset < now) {
    attempts.set(key, { n: 1, reset: now + windowMs })
    if (attempts.size > 5000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k)
    return false
  }
  a.n++
  return a.n > max
}

export function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local"
}

/** Rejects cross-site form posts: JSON bodies only, and same-origin when the browser says. */
export function sameOrigin(req: Request): boolean {
  const ct = req.headers.get("content-type") || ""
  if (req.method !== "GET" && req.method !== "DELETE" && !ct.includes("application/json")) return false
  const origin = req.headers.get("origin")
  if (!origin) return true
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
