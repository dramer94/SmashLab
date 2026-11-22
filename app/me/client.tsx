"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Copy, LogOut, Trash2 } from "lucide-react"
import { SHOT_LABELS } from "@/lib/analysis/engine"
import { SHOT_TYPES, type ShotType } from "@/lib/analysis/types"

interface Stat {
  id: string
  createdAt: string
  videoName: string
  format: string
  side: string
  playerName: string
  durationS: number
  rallies: number
  pointsWon: number
  pointsLost: number
  shots: number
  smashes: number
  fastestKmh: number | null
  avgSmashKmh: number | null
  distanceM: number
  calories: number
  shotTypes: Record<string, number>
}
interface Share { id: string; title: string; views: number; createdAt: string }
interface User { id: string; name: string; email: string; isPublic: boolean }

const card = "rounded-xl border border-white/10 bg-[var(--card)] p-4 sm:p-5"
const tooltipStyle = {
  contentStyle: { background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#f0efec" },
  labelStyle: { color: "#f0efec", fontWeight: 600 },
  itemStyle: { color: "#c3c2b7" },
}
const fmtDate = (s: string) => new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short" })

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={card}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  )
}

export function ProfileClient({ user, stats: initialStats, shares: initialShares }: { user: User; stats: Stat[]; shares: Share[] }) {
  const router = useRouter()
  const [stats, setStats] = useState(initialStats)
  const [shares, setShares] = useState(initialShares)
  const [name, setName] = useState(user.name)
  const [isPublic, setIsPublic] = useState(user.isPublic)
  const [msg, setMsg] = useState<string | null>(null)

  const call = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || "Something went wrong.")
    return data
  }

  const totals = useMemo(() => {
    const won = stats.reduce((a, s) => a + s.pointsWon, 0)
    const lost = stats.reduce((a, s) => a + s.pointsLost, 0)
    const best = stats.reduce<number | null>((m, s) => (s.fastestKmh != null && (m == null || s.fastestKmh > m) ? s.fastestKmh : m), null)
    const types = Object.fromEntries(SHOT_TYPES.map((t) => [t, stats.reduce((a, s) => a + (s.shotTypes[t] ?? 0), 0)])) as Record<ShotType, number>
    return {
      videos: stats.length,
      shots: stats.reduce((a, s) => a + s.shots, 0),
      distanceKm: stats.reduce((a, s) => a + s.distanceM, 0) / 1000,
      calories: stats.reduce((a, s) => a + s.calories, 0),
      best,
      winPct: won + lost ? Math.round((won / (won + lost)) * 100) : null,
      types,
    }
  }, [stats])

  const timeline = useMemo(
    () => [...stats].reverse().slice(-30).map((s) => ({ date: fmtDate(s.createdAt), shots: s.shots, fastest: s.fastestKmh, video: s.videoName })),
    [stats]
  )
  const mix = SHOT_TYPES.filter((t) => totals.types[t] > 0).map((t) => ({ type: SHOT_LABELS[t], n: totals.types[t] }))

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">{name}</h1>
          <p className="text-gray-400">{user.email} · Rally Analysis profile</p>
        </div>
        <div className="flex gap-2">
          <Link href="/analysis" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Analyse a video</Link>
          <Link href="/analysis/leaderboard" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-200 hover:bg-white/5">Leaderboard</Link>
        </div>
      </div>

      {stats.length === 0 ? (
        <div className={card}>
          <p className="text-gray-300">No saved videos yet.</p>
          <p className="mt-1 text-sm text-gray-500">
            Analyse a video, then under <span className="text-gray-300">Save & share</span> pick which player you are and tap <span className="text-gray-300">Save to my profile</span>.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile label="Videos" value={String(totals.videos)} />
            <Tile label="Shots" value={String(totals.shots)} />
            <Tile label="Distance" value={`${totals.distanceKm.toFixed(2)} km`} sub="footwork on court" />
            <Tile label="Best smash" value={totals.best ? `${totals.best} km/h` : "–"} sub="estimate" />
            <Tile label="Points won" value={totals.winPct != null ? `${totals.winPct}%` : "–"} />
            <Tile label="Calories" value={`${Math.round(totals.calories)}`} sub="kcal, estimate" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className={card}>
              <h2 className="mb-3 font-semibold text-white">Shots per video</h2>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeline} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#2c2c2a" />
                    <XAxis dataKey="date" tick={{ fill: "#898781", fontSize: 11 }} axisLine={{ stroke: "#383835" }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "#898781", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="shots" name="Shots" fill="#3987e5" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className={card}>
              <h2 className="mb-3 font-semibold text-white">Fastest shot per video (km/h)</h2>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#2c2c2a" />
                    <XAxis dataKey="date" tick={{ fill: "#898781", fontSize: 11 }} axisLine={{ stroke: "#383835" }} tickLine={false} />
                    <YAxis tick={{ fill: "#898781", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Line dataKey="fastest" name="Fastest" stroke="#3987e5" strokeWidth={2} dot={{ r: 4, fill: "#3987e5", stroke: "#111827", strokeWidth: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className={card}>
              <h2 className="mb-3 font-semibold text-white">Shot mix</h2>
              <div style={{ height: Math.max(160, mix.length * 32 + 20) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mix} layout="vertical" margin={{ left: 4, right: 12, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="type" width={86} tick={{ fill: "#c3c2b7", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="n" name="Shots" fill="#3987e5" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className={`${card} lg:col-span-2`}>
              <h2 className="mb-3 font-semibold text-white">Saved videos</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Video</th>
                      <th className="pb-2 text-right font-medium">Shots</th>
                      <th className="pb-2 text-right font-medium">Points</th>
                      <th className="pb-2 text-right font-medium">Distance</th>
                      <th className="pb-2 text-right font-medium">Fastest</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => (
                      <tr key={s.id} className="border-t border-white/5">
                        <td className="py-2 text-gray-400">{fmtDate(s.createdAt)}</td>
                        <td className="max-w-[200px] truncate py-2 text-gray-200" title={s.videoName}>{s.videoName} <span className="text-xs text-gray-500">as {s.playerName}</span></td>
                        <td className="py-2 text-right tabular-nums">{s.shots}</td>
                        <td className="py-2 text-right tabular-nums">{s.pointsWon}–{s.pointsLost}</td>
                        <td className="py-2 text-right tabular-nums">{s.distanceM.toFixed(0)} m</td>
                        <td className="py-2 text-right tabular-nums">{s.fastestKmh ? `${s.fastestKmh} km/h` : "–"}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            aria-label={`Delete ${s.videoName}`}
                            className="rounded p-1 text-gray-500 hover:text-red-300"
                            onClick={async () => {
                              if (!confirm("Remove this video's stats from your profile?")) return
                              await call(`/api/me/stats/${s.id}`, "DELETE")
                              setStats((x) => x.filter((y) => y.id !== s.id))
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-3 font-semibold text-white">Shared results</h2>
          {shares.length === 0 ? (
            <p className="text-sm text-gray-500">Links you create with “Create link” on a result appear here (up to 50).</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {shares.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                  <Link href={`/analysis/share/${s.id}`} className="min-w-0 flex-1 truncate text-white hover:text-blue-300">{s.title}</Link>
                  <span className="text-xs text-gray-500">{s.views} views · {fmtDate(s.createdAt)}</span>
                  <button type="button" aria-label="Copy link" className="rounded p-1 text-gray-400 hover:text-white" onClick={() => navigator.clipboard?.writeText(`${location.origin}/analysis/share/${s.id}`).then(() => setMsg("Link copied."))}>
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete link ${s.title}`}
                    className="rounded p-1 text-gray-500 hover:text-red-300"
                    onClick={async () => {
                      if (!confirm("Delete this link? People who have it will no longer see the page.")) return
                      await call(`/api/share/${s.id}`, "DELETE")
                      setShares((x) => x.filter((y) => y.id !== s.id))
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`${card} space-y-4`}>
          <h2 className="font-semibold text-white">Settings</h2>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await call("/api/me", "PATCH", { name })
                setMsg("Name saved.")
                router.refresh()
              } catch (err) { setMsg((err as Error).message) }
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Display name" className="flex-1 rounded-md border border-white/10 bg-[var(--background)] px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
            <button type="submit" className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5">Save name</button>
          </form>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={isPublic}
              className="accent-blue-500"
              onChange={async (e) => {
                const v = e.target.checked
                setIsPublic(v)
                try { await call("/api/me", "PATCH", { isPublic: v }) } catch (err) { setMsg((err as Error).message); setIsPublic(!v) }
              }}
            />
            Show me on the weekly leaderboard
          </label>
          {msg && <p className="text-sm text-gray-400">{msg}</p>}
          <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5"
              onClick={async () => {
                await call("/api/auth/logout", "POST", {})
                window.dispatchEvent(new Event("smashlab:auth"))
                router.push("/analysis")
                router.refresh()
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
              onClick={async () => {
                if (!confirm("Delete your account? Your saved stats and share links are deleted too. This cannot be undone.")) return
                await call("/api/me", "DELETE")
                window.dispatchEvent(new Event("smashlab:auth"))
                router.push("/analysis")
                router.refresh()
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete account
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
