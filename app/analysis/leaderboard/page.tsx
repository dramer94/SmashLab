import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { weekStart } from "@/lib/analysis/profile"

export const metadata: Metadata = {
  title: "Rally Analysis leaderboard",
  description: "This week's most shots, fastest smashes and most court covered by SmashLab players, from their analysed match videos.",
}
export const dynamic = "force-dynamic"

type Row = { userId: string; name: string; value: number; videos: number }

async function board(since: Date | null) {
  const where = { ...(since ? { createdAt: { gte: since } } : {}), user: { isPublic: true } }
  const grouped = await prisma.slPlayStat.groupBy({
    by: ["userId"],
    where,
    _sum: { shots: true, distanceM: true },
    _max: { fastestKmh: true },
    _count: { _all: true },
  })
  const users = await prisma.slUser.findMany({ where: { id: { in: grouped.map((g) => g.userId) } }, select: { id: true, name: true } })
  const name = new Map(users.map((u) => [u.id, u.name]))
  const rows = (pick: (g: (typeof grouped)[number]) => number | null) =>
    grouped
      .map((g) => ({ userId: g.userId, name: name.get(g.userId) ?? "Player", value: pick(g) ?? 0, videos: g._count._all }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
  return {
    shots: rows((g) => g._sum.shots),
    smash: rows((g) => g._max.fastestKmh),
    distance: rows((g) => g._sum.distanceM),
  }
}

function Board({ title, unit, rows, digits = 0 }: { title: string; unit: string; rows: Row[]; digits?: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[var(--card)] p-4 sm:p-5">
      <h2 className="mb-3 font-semibold text-white">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nobody yet. Be the first: analyse a video and save it to your profile.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.userId} className="flex items-center gap-3 text-sm">
              <span className={`w-6 text-right font-bold tabular-nums ${i < 3 ? "text-amber-300" : "text-gray-500"}`}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-gray-200">{r.name}</span>
              <span className="text-xs text-gray-500">{r.videos} video{r.videos > 1 ? "s" : ""}</span>
              <span className="w-24 text-right font-semibold tabular-nums text-white">{r.value.toFixed(digits)} {unit}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams
  const all = range === "all"
  const since = all ? null : weekStart()
  let data: Awaited<ReturnType<typeof board>> | null = null
  try {
    data = await board(since)
  } catch {
    data = null
  }
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Rally Analysis leaderboard</h1>
          <p className="text-gray-400">
            {all ? "All time" : `This week, from Monday ${since!.toLocaleDateString("en-MY", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" })}`}
            {" "}· from videos players analysed and saved to their profile. Speeds and distances are estimates.
          </p>
        </div>
        <div className="flex rounded-md border border-white/10 p-0.5 text-sm">
          <Link href="/analysis/leaderboard" className={`rounded px-3 py-1.5 ${!all ? "bg-white/10 text-white" : "text-gray-400"}`}>This week</Link>
          <Link href="/analysis/leaderboard?range=all" className={`rounded px-3 py-1.5 ${all ? "bg-white/10 text-white" : "text-gray-400"}`}>All time</Link>
        </div>
      </div>
      {!data ? (
        <p className="text-gray-400">The leaderboard is not available right now.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Board title="Most shots" unit="shots" rows={data.shots} />
          <Board title="Fastest smash" unit="km/h" rows={data.smash} />
          <Board title="Most court covered" unit="m" rows={data.distance} />
        </div>
      )}
      <p className="text-sm text-gray-500">
        Want to be on it? <Link href="/analysis" className="text-blue-400 hover:text-blue-300">Analyse a video</Link>, then save it to your profile. You can hide yourself from the leaderboard on your profile.
      </p>
    </div>
  )
}
