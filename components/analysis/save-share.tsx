"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Check, Copy, Link2, Loader2, UserRound } from "lucide-react"
import { AuthForm, type SessionUser } from "@/components/account/auth-form"
import { statFromResult } from "@/lib/analysis/profile"
import type { AnalysisResult, Session, Side } from "@/lib/analysis/types"

/** Save "my" stats from this analysis to the profile, and publish a share link. */
export function SaveShareCard({ session, result, update }: { session: Session; result: AnalysisResult; update: (fn: (s: Session) => Session) => void }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [showAuth, setShowAuth] = useState(false)
  const [busy, setBusy] = useState<"save" | "share" | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [title, setTitle] = useState(session.video.name.replace(/\.[^.]+$/, ""))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = () => fetch("/api/auth/me").then((r) => r.json()).then((d) => setUser(d.user ?? null)).catch(() => setUser(null))
    load()
    window.addEventListener("smashlab:auth", load)
    return () => window.removeEventListener("smashlab:auth", load)
  }, [])

  const players = (["near", "far"] as Side[]).flatMap((side) => session.settings.players[side].map((p, slot) => ({ side, slot, name: p.name })))
  const me = session.me
  const shareUrl = session.shareId && typeof window !== "undefined" ? `${window.location.origin}/analysis/share/${session.shareId}` : null

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || (res.status >= 500 ? "Saving is not available right now. Try again later." : "Something went wrong."))
    return data
  }

  const save = async () => {
    if (!me) return
    setBusy("save")
    setMsg(null)
    try {
      await post("/api/me/stats", statFromResult(result, session, me.side, me.slot))
      update((s) => ({ ...s, savedAt: Date.now() }))
      setMsg("saved")
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const share = async () => {
    setBusy("share")
    setMsg(null)
    try {
      // The results only: everything needed to redraw the stats, never the video.
      const { shareId: _drop, savedAt: _drop2, ...data } = session
      void _drop
      void _drop2
      const { id } = await post("/api/share", { title, data })
      update((s) => ({ ...s, shareId: id }))
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-[var(--card)] p-5">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <UserRound className="h-4 w-4 text-blue-400" /> Save & share
      </h3>
      {user === undefined ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !user ? (
        showAuth ? (
          <AuthForm compact onDone={(u) => { setUser(u); setShowAuth(false) }} />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-400">Sign in to keep your stats on your profile, join the weekly leaderboard and share a results page. Your video is never uploaded.</p>
            <button type="button" onClick={() => setShowAuth(true)} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
              Sign in or create account
            </button>
          </div>
        )
      ) : (
        <>
          <div>
            <div className="mb-1.5 text-sm text-gray-400">Which player are you, {user.name}?</div>
            <div className="flex flex-wrap gap-1.5">
              {players.map((p) => {
                const on = me?.side === p.side && me.slot === p.slot
                return (
                  <button
                    key={`${p.side}${p.slot}`}
                    type="button"
                    onClick={() => { update((s) => ({ ...s, me: { side: p.side, slot: p.slot } })); setMsg(null) }}
                    className={`rounded-md border px-2.5 py-1 text-sm ${on ? "border-blue-500 bg-blue-500/15 text-white" : "border-white/10 text-gray-400 hover:text-gray-200"}`}
                  >
                    {p.name} <span className="text-xs text-gray-500">({p.side})</span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              disabled={!me || busy != null}
              onClick={save}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
              {session.savedAt ? "Update my profile" : "Save to my profile"}
            </button>
            {msg === "saved" ? (
              <p className="mt-2 flex items-center gap-1 text-sm text-green-300">
                <Check className="h-4 w-4" /> Saved. <Link href="/me" className="underline">See your profile</Link>
              </p>
            ) : (
              msg && <p className="mt-2 text-sm text-amber-300">{msg}</p>
            )}
          </div>
          <div className="border-t border-white/5 pt-4">
            <div className="mb-1.5 text-sm text-gray-400">Share the results (stats, rallies, court map; not the video)</div>
            {shareUrl ? (
              <div className="flex items-center gap-2">
                <input readOnly value={shareUrl} aria-label="Share link" className="min-w-0 flex-1 rounded-md border border-white/10 bg-[var(--background)] px-2.5 py-1.5 text-xs text-gray-200" onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  aria-label="Copy share link"
                  onClick={() => navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
                  className="rounded-md border border-white/10 p-1.5 text-gray-300 hover:bg-white/5"
                >
                  {copied ? <Check className="h-4 w-4 text-green-300" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} aria-label="Title of the shared page" className="min-w-0 flex-1 rounded-md border border-white/10 bg-[var(--background)] px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                <button type="button" onClick={share} disabled={busy != null} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-40">
                  {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create link
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
