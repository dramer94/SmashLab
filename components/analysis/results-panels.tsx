"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { CourtSvg } from "./court-svg"
import { SHOT_LABELS } from "@/lib/analysis/engine"
import { SIDE_COLORS } from "@/lib/analysis/overlay"
import { COURT_L, COURT_W } from "@/lib/analysis/geometry"
import { SHOT_TYPES, type AnalysisResult, type Rally, type Session, type ShotType, type Side } from "@/lib/analysis/types"

const card = "rounded-xl border border-white/10 bg-[var(--card)] p-4 sm:p-5"
const sideName = (session: Session, side: Side) => session.settings.players[side].map((p) => p.name).join(" / ")

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={card}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  )
}

export function SummaryTiles({ result }: { result: AnalysisResult }) {
  const t = result.totals
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Tile label="Shots" value={String(t.shots)} sub={`${t.tempoShotsPerMin || 0} per minute in play`} />
      <Tile label="Rallies" value={String(t.rallies)} sub={`${t.avgShotsPerRally} shots on average`} />
      <Tile label="Longest rally" value={`${t.longestRallyShots} shots`} sub={`${t.longestRallyS.toFixed(1)} s longest`} />
      <Tile label="Fastest shot" value={t.fastest ? `${t.fastest.speedKmh} km/h` : "–"} sub={t.fastest ? `${SHOT_LABELS[t.fastest.type]} · estimate` : "needs tracked players"} />
      <Tile label="Ball in play" value={`${t.playTimeS.toFixed(0)} s`} sub="serve to last hit, all rallies" />
      <Tile label="Points" value={`${result.sides.near.ralliesWon}–${result.sides.far.ralliesWon}`} sub="near – far" />
    </div>
  )
}

export function PlayersTable({ result, session }: { result: AnalysisResult; session: Session }) {
  return (
    <div className={card}>
      <h3 className="mb-3 font-semibold text-white">Players</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="pb-2 font-medium">Player</th>
              <th className="pb-2 text-right font-medium">Shots</th>
              <th className="pb-2 text-right font-medium">Distance</th>
              <th className="pb-2 text-right font-medium">Top speed</th>
              <th className="pb-2 text-right font-medium">Calories</th>
              <th className="pb-2 text-right font-medium">Fastest shot</th>
            </tr>
          </thead>
          <tbody>
            {result.players.map((p) => (
              <tr key={`${p.side}${p.playerIndex}`} className="border-t border-white/5">
                <td className="py-2">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: SIDE_COLORS[p.side] }} />
                  <span className="text-white">{p.name}</span>
                  <span className="ml-1.5 text-xs text-gray-500">{p.side}</span>
                </td>
                <td className="py-2 text-right tabular-nums text-gray-200">
                  {session.settings.format === "doubles" ? `${p.shots}` : result.sides[p.side].shots}
                </td>
                <td className="py-2 text-right tabular-nums text-gray-200">{p.distanceM.toFixed(0)} m</td>
                <td className="py-2 text-right tabular-nums text-gray-200">{p.topSpeedMs ? `${p.topSpeedMs.toFixed(1)} m/s` : "–"}</td>
                <td className="py-2 text-right tabular-nums text-gray-200">{p.calories.toFixed(0)} kcal</td>
                <td className="py-2 text-right tabular-nums text-gray-200">{result.sides[p.side].fastestKmh ? `${result.sides[p.side].fastestKmh} km/h` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Distance is footwork on the floor, from the tracked foot position. Speeds and calories are estimates. In doubles, a shot goes to the partner who was moving more just before contact.
      </p>
    </div>
  )
}

export function ShotTypeChart({ result, session }: { result: AnalysisResult; session: Session }) {
  const data = SHOT_TYPES.filter((t) => result.sides.near.byType[t] + result.sides.far.byType[t] > 0).map((t) => ({
    type: SHOT_LABELS[t],
    near: result.sides.near.byType[t],
    far: result.sides.far.byType[t],
  }))
  const [showTable, setShowTable] = useState(false)
  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-white">Shot types</h3>
        <button type="button" onClick={() => setShowTable(!showTable)} className="text-xs text-blue-400 hover:text-blue-300">
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-gray-500">No shots yet.</p>
      ) : showTable ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="pb-2">Type</th><th className="pb-2 text-right">{sideName(session, "near")}</th><th className="pb-2 text-right">{sideName(session, "far")}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.type} className="border-t border-white/5"><td className="py-1.5 text-gray-200">{d.type}</td><td className="py-1.5 text-right tabular-nums">{d.near}</td><td className="py-1.5 text-right tabular-nums">{d.far}</td></tr>)}</tbody>
        </table>
      ) : (
        <div style={{ height: Math.max(180, data.length * 44 + 50) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid horizontal={false} stroke="#2c2c2a" />
              <XAxis type="number" allowDecimals={false} stroke="#898781" tick={{ fill: "#898781", fontSize: 12 }} axisLine={{ stroke: "#383835" }} tickLine={false} />
              <YAxis type="category" dataKey="type" width={92} tick={{ fill: "#c3c2b7", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#f0efec" }}
                labelStyle={{ color: "#f0efec", fontWeight: 600 }}
                itemStyle={{ color: "#c3c2b7" }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#c3c2b7" }} formatter={(v) => <span style={{ color: "#c3c2b7" }}>{v}</span>} />
              <Bar dataKey="near" name={`${sideName(session, "near")} (near)`} fill={SIDE_COLORS.near} radius={[0, 4, 4, 0]} barSize={14} />
              <Bar dataKey="far" name={`${sideName(session, "far")} (far)`} fill={SIDE_COLORS.far} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

const CELL = 0.61 // ten cells across the court

export function CourtMap({ result, session, onShot }: { result: AnalysisResult; session: Session; onShot: (id: string) => void }) {
  const [layer, setLayer] = useState<"heat" | "paths" | "shots">("heat")
  const [typeFilter, setTypeFilter] = useState<ShotType | "all">("all")
  const [hover, setHover] = useState<string | null>(null)

  const heat = useMemo(() => {
    const cols = Math.ceil((COURT_W + 2) / CELL)
    const rows = Math.ceil((COURT_L + 2) / CELL)
    const out: Record<Side, number[]> = { near: Array(cols * rows).fill(0), far: Array(cols * rows).fill(0) }
    for (const p of result.players) {
      for (const q of p.path) {
        const cx = Math.floor((q.x + 1) / CELL)
        const cy = Math.floor((q.y + 1) / CELL)
        if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) out[p.side][cy * cols + cx]++
      }
    }
    const max = { near: Math.max(1, ...out.near), far: Math.max(1, ...out.far) }
    return { cols, rows, out, max }
  }, [result.players])

  const shots = result.shots.filter((s) => s.pos && (typeFilter === "all" || s.type === typeFilter))
  const hovered = result.shots.find((s) => s.id === hover)

  return (
    <div className={card}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-semibold text-white">Court map</h3>
        <div className="flex rounded-md border border-white/10 p-0.5 text-xs">
          {(["heat", "paths", "shots"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLayer(l)} className={`rounded px-2 py-1 ${layer === l ? "bg-white/10 text-white" : "text-gray-400"}`}>
              {l === "heat" ? "Heatmap" : l === "paths" ? "Movement" : "Hit points"}
            </button>
          ))}
        </div>
        {layer === "shots" && (
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ShotType | "all")} className="rounded-md border border-white/10 bg-[var(--card)] px-2 py-1 text-xs text-gray-200" aria-label="Shot type filter">
            <option value="all">All shots</option>
            {SHOT_TYPES.map((t) => <option key={t} value={t}>{SHOT_LABELS[t]}</option>)}
          </select>
        )}
      </div>
      <div className="relative mx-auto max-w-[260px]">
        <CourtSvg className="w-full" label="Court map of player positions">
          {layer === "heat" &&
            (["near", "far"] as Side[]).map((side) =>
              heat.out[side].map((v, i) =>
                v ? (
                  <rect
                    key={`${side}${i}`}
                    x={(i % heat.cols) * CELL - 1}
                    y={Math.floor(i / heat.cols) * CELL - 1}
                    width={CELL}
                    height={CELL}
                    fill={SIDE_COLORS[side]}
                    fillOpacity={0.12 + 0.78 * Math.sqrt(v / heat.max[side])}
                  />
                ) : null
              )
            )}
          {layer === "paths" &&
            result.players.map((p) => (
              <polyline
                key={`${p.side}${p.playerIndex}`}
                points={p.path.map((q) => `${q.x},${q.y}`).join(" ")}
                fill="none"
                stroke={SIDE_COLORS[p.side]}
                strokeOpacity={0.7}
                strokeWidth={0.06}
                strokeDasharray={p.playerIndex ? "0.2 0.12" : undefined}
              />
            ))}
          {layer === "shots" &&
            shots.map((s) => (
              <circle
                key={s.id}
                cx={s.pos!.x}
                cy={s.pos!.y}
                r={hover === s.id ? 0.28 : 0.2}
                fill={SIDE_COLORS[s.side]}
                stroke="#0a0e1a"
                strokeWidth={0.06}
                className="cursor-pointer"
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onShot(s.id)}
              />
            ))}
        </CourtSvg>
        {hovered && (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#111827] px-2 py-1 text-xs text-gray-200">
            Rally {hovered.rallyIndex + 1} · {SHOT_LABELS[hovered.type]}{hovered.speedKmh ? ` · ~${hovered.speedKmh} km/h` : ""}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-gray-400">
        {(["far", "near"] as Side[]).map((side) => (
          <span key={side} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SIDE_COLORS[side] }} />
            {sideName(session, side)} ({side})
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-gray-500">
        {layer === "heat" ? "Darker squares = more time spent there." : layer === "paths" ? "Every step on the floor during the clip." : "Where each shot was hit from. Click one to watch it."}
      </p>
    </div>
  )
}

export function RallyList({
  result,
  session,
  onRally,
  onToggleWinner,
  onShot,
}: {
  result: AnalysisResult
  session: Session
  onRally: (r: Rally) => void
  onToggleWinner: (r: Rally) => void
  onShot: (id: string) => void
}) {
  const [open, setOpen] = useState<number | null>(null)
  const fmt = (t: number) => {
    const s = t - session.range.start
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`
  }
  return (
    <div className={card}>
      <h3 className="mb-1 font-semibold text-white">Rallies & score</h3>
      <p className="mb-3 text-xs text-gray-500">
        The winner of a rally serves the next one, so the score follows from who serves. When that is unclear the last hitter gets the point. Tap the winner to change it.
      </p>
      {result.rallies.length === 0 && <p className="text-sm text-gray-500">No rallies found yet. Lower the sensitivity or add shots on the timeline.</p>}
      <div className="divide-y divide-white/5">
        {result.rallies.map((r) => (
          <div key={r.id} className="py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <button type="button" onClick={() => { onRally(r); setOpen(open === r.index ? null : r.index) }} className="font-medium text-white hover:text-blue-300">
                Rally {r.index + 1}
              </button>
              <span className="tabular-nums text-gray-500">{fmt(r.start)}</span>
              <span className="text-gray-300">{r.shots.length} shots · {r.durationS.toFixed(1)} s</span>
              <span className="text-xs text-gray-500">served by {r.server}{r.serverSource === "sound" ? " (from sound)" : r.serverSource === "manual" ? " (set by you)" : ""}</span>
              <button
                type="button"
                onClick={() => onToggleWinner(r)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-0.5 text-xs text-gray-200 hover:bg-white/5"
                title="Change who won this rally"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: SIDE_COLORS[r.winner] }} />
                {sideName(session, r.winner)} won{r.winnerSource === "manual" ? " ✓" : ""}
              </button>
              <span className="w-12 text-right font-semibold tabular-nums text-white">{r.scoreAfter.near}–{r.scoreAfter.far}</span>
            </div>
            {open === r.index && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {r.shots.map((s, i) => (
                  <span key={s.id} className="inline-flex items-center gap-1">
                    {i > 0 && <span className="text-gray-600">→</span>}
                    <button
                      type="button"
                      onClick={() => onShot(s.id)}
                      className="rounded-md border px-1.5 py-0.5 text-xs text-gray-200 hover:bg-white/5"
                      style={{ borderColor: SIDE_COLORS[s.side] + "99" }}
                    >
                      {SHOT_LABELS[s.type]}{s.speedKmh && (s.type === "smash" || s.type === "drive") ? ` ${s.speedKmh}` : ""}
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
