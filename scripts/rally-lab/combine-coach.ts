// One coach report per named player, combining every analysed part they appear in.
// usage: npx tsx combine-coach.ts <config.json> <out.json>
// config: [{ "file": "lab-data/s6054-0.json", "video": "IMG_6054", "names": { "near0": "AMER", "near1": "...", "far0": "...", "far1": "..." } }]
// Keys are side+slot as tracked in that session; a missing key = player not named (left out).
import { readFileSync, writeFileSync } from "node:fs"
import { buildResult, SHOT_LABELS } from "../../lib/analysis/engine.ts"
import { coachReport, type CoachTip } from "../../lib/analysis/coach.ts"
import type { Session, Side } from "../../lib/analysis/types.ts"

type Part = { file: string; video: string; names: Record<string, string> }
const [cfgPath, outPath] = process.argv.slice(2)
const parts: Part[] = JSON.parse(readFileSync(cfgPath, "utf8"))

const mmss = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`

interface PartReport {
  video: string
  range: string
  side: Side
  slot: number
  summary: string
  numbers: { label: string; value: string }[]
  tips: (CoachTip & { video: string })[]
  shots: number
  byType: Record<string, number>
  smashKmh: number[]
  distanceM: number
  rallies: number
}
const byPlayer = new Map<string, PartReport[]>()

for (const part of parts) {
  const session: Session = JSON.parse(readFileSync(part.file, "utf8"))
  for (const side of ["near", "far"] as Side[]) {
    session.settings.players[side] = session.settings.players[side].map((p, slot) => ({ ...p, name: part.names[`${side}${slot}`] ?? p.name }))
  }
  const result = buildResult(session)
  for (const [key, name] of Object.entries(part.names)) {
    const side = key.slice(0, -1) as Side
    const slot = Number(key.slice(-1))
    const rep = coachReport(session, result, side, slot)
    const mine = result.shots.filter((s) => s.side === side && s.playerIndex === slot && s.type !== "serve")
    const byType: Record<string, number> = {}
    for (const s of mine) byType[s.type] = (byType[s.type] ?? 0) + 1
    const stats = result.players.find((p) => p.side === side && p.playerIndex === slot)
    // Moment times are video times; label them with the video so they can be found.
    const tag = (t: CoachTip) => ({ ...t, video: part.video, moments: t.moments.map((m) => ({ ...m, label: `${part.video} ${mmss(m.t)}` })) })
    const list = byPlayer.get(name) ?? []
    list.push({
      video: part.video,
      range: `${mmss(session.range.start)}–${mmss(session.range.end)}`,
      side, slot,
      summary: rep.summary,
      numbers: rep.numbers,
      tips: [...rep.strengths, ...rep.improve].map(tag),
      shots: mine.length,
      byType,
      smashKmh: mine.filter((s) => s.type === "smash" && s.speedKmh != null).map((s) => s.speedKmh!),
      distanceM: stats?.distanceM ?? 0,
      rallies: result.rallies.length,
    })
    byPlayer.set(name, list)
  }
}

const out = [...byPlayer.entries()].map(([name, reps]) => {
  // A tip that shows up in several parts is a pattern, not a one-off.
  const groups = new Map<string, { kind: string; title: string; parts: (CoachTip & { video: string })[] }>()
  for (const r of reps) for (const t of r.tips) {
    const g = groups.get(t.title) ?? { kind: t.kind, title: t.title, parts: [] }
    g.parts.push(t)
    groups.set(t.title, g)
  }
  const ranked = [...groups.values()].map((g) => {
    const best = g.parts.reduce((a, b) => (b.weight > a.weight ? b : a))
    return {
      kind: g.kind,
      title: g.title,
      seenIn: g.parts.length,
      ofParts: reps.length,
      relative: g.parts.every((p) => p.relative),
      evidence: `${best.video}: ${best.evidence}`,
      why: best.why,
      drill: best.drill,
      moments: g.parts.flatMap((p) => p.moments).slice(0, 4),
      score: g.parts.length * 10 + g.parts.reduce((a, p) => a + p.weight, 0),
    }
  }).sort((a, b) => b.score - a.score)
  const byType: Record<string, number> = {}
  for (const r of reps) for (const [k, v] of Object.entries(r.byType)) byType[k] = (byType[k] ?? 0) + v
  const smash = reps.flatMap((r) => r.smashKmh)
  const strengths = ranked.filter((t) => t.kind === "strength").slice(0, 3)
  const improve = ranked.filter((t) => t.kind === "improve").slice(0, 3)
  return {
    name,
    videos: [...new Set(reps.map((r) => r.video))],
    parts: reps.map(({ tips, ...r }) => r),
    totals: {
      shots: reps.reduce((a, r) => a + r.shots, 0),
      byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [SHOT_LABELS[k as keyof typeof SHOT_LABELS] ?? k, v])),
      smashes: smash.length,
      avgSmashKmh: smash.length ? Math.round(smash.reduce((a, b) => a + b, 0) / smash.length) : null,
      distanceM: Math.round(reps.reduce((a, r) => a + r.distanceM, 0)),
    },
    summary: improve.length
      ? `Main thing to work on: ${improve[0].title.toLowerCase()} (seen in ${improve[0].seenIn} of ${reps.length} parts).${strengths.length ? ` Keep doing: ${strengths[0].title.toLowerCase()}.` : ""}`
      : strengths.length ? `Nothing stood out to fix. Keep doing: ${strengths[0].title.toLowerCase()}.` : "Not enough tracked play to give advice.",
    strengths,
    improve,
  }
})
writeFileSync(outPath, JSON.stringify(out, null, 2))
for (const p of out) console.log(`${p.name.padEnd(10)} ${p.parts.length} parts, ${p.totals.shots} shots — ${p.summary}`)
