import { onsetScore } from "./audio"
import { depthFromNet, dist } from "./geometry"
import {
  SHOT_TYPES,
  type AnalysisResult,
  type PlayerStats,
  type Pt,
  type Rally,
  type Session,
  type Shot,
  type ShotType,
  type Side,
  type SideStats,
  type TrackFrame,
} from "./types"

/** Shuttle drag length (m): terminal velocity² / g, with v_t ≈ 6.7 m/s. */
const DRAG_L = (6.7 * 6.7) / 9.81
const SOUND_PARITY_DB = 3

export const other = (s: Side): Side => (s === "near" ? "far" : "near")

export const SHOT_LABELS: Record<ShotType, string> = {
  serve: "Serve",
  clear: "Clear",
  smash: "Smash",
  drop: "Drop",
  net: "Net shot",
  lift: "Lift",
  drive: "Drive",
  push: "Push / block",
  other: "Other",
}

/** Linear interpolation of one tracked player's position at time t. */
export function positionAt(track: TrackFrame[], side: Side, slot: number, t: number): Pt | null {
  if (!track.length) return null
  let lo = 0, hi = track.length - 1
  if (t <= track[0].t) return track[0][side][slot] ?? null
  if (t >= track[hi].t) return track[hi][side][slot] ?? null
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (track[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = track[lo][side][slot]
  const b = track[hi][side][slot]
  if (!a || !b) return a ?? b ?? null
  const f = (t - track[lo].t) / (track[hi].t - track[lo].t || 1)
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}

/**
 * Initial speed of a shuttle that covers `d` metres in `t` seconds under
 * quadratic drag: d = L·ln(1 + v0·t/L)  =>  v0 = L·(e^(d/L) − 1)/t.
 */
export function initialSpeedKmh(d: number, t: number): number | null {
  if (t < 0.15 || d <= 0) return null
  const v0 = (DRAG_L * (Math.exp(Math.min(d / DRAG_L, 4)) - 1)) / t
  return Math.round(Math.min(420, v0 * 3.6))
}

interface Ctx {
  hitter: Pt | null
  receiver: Pt | null
  flight: number | null
  speed: number | null
  first: boolean
}

/** Rule-based shot type from where it was hit, where it went and how fast. */
export function classifyShot({ hitter, receiver, flight, speed, first }: Ctx): ShotType {
  if (first) return "serve"
  if (!hitter) return "other"
  const dn = depthFromNet(hitter)
  const dr = receiver ? depthFromNet(receiver) : null
  if (flight == null) {
    // Last shot of a rally: nothing came back, judge by where it was hit from.
    if (dn < 2.2) return "net"
    if (dn > 4.3) return "smash"
    return "drive"
  }
  if (dn < 2.2) {
    if (flight > 1.05) return "lift"
    if (dr != null && dr < 3) return "net"
    return "push"
  }
  if (dn > 4.3) {
    if (flight < 0.85 && (speed ?? 0) > 110) return "smash"
    if (dr != null && dr < 3.2) return "drop"
    if (flight >= 1.05) return "clear"
    return (speed ?? 0) > 110 ? "smash" : "drive"
  }
  if (flight < 0.8) return (speed ?? 0) > 170 ? "smash" : "drive"
  if (flight >= 1.2) return "clear"
  return dr != null && dr < 3 ? "push" : "drive"
}

function movedOver(track: TrackFrame[], side: Side, slot: number, t0: number, t1: number) {
  const a = positionAt(track, side, slot, t0)
  const b = positionAt(track, side, slot, t1)
  return a && b ? dist(a, b) : -1
}

/** Path length with a 0.25 m hysteresis so tracking jitter is not counted as running. */
function pathStats(track: TrackFrame[], side: Side, slot: number) {
  let distance = 0
  let anchor: Pt | null = null
  let anchorT = 0
  let top = 0
  const path: Pt[] = []
  for (const f of track) {
    const p = f[side][slot]
    if (!p) continue
    path.push(p)
    if (!anchor) { anchor = p; anchorT = f.t; continue }
    const d = dist(anchor, p)
    const dt = f.t - anchorT
    if (dt > 1.5) { anchor = p; anchorT = f.t; continue } // lost in between
    if (d >= 0.25) {
      const v = d / Math.max(dt, 0.05)
      if (v <= 8.5) {
        distance += d
        if (dt >= 0.2) top = Math.max(top, v)
      }
      anchor = p
      anchorT = f.t
    }
  }
  return { distance, top, path }
}

export function buildResult(session: Session): AnalysisResult {
  const { settings, range, track, edits } = session
  const slots = settings.format === "doubles" ? 2 : 1

  type Raw = { id: string; t: number; manual: boolean; level: number | null }
  const raws: Raw[] = [
    ...session.onsets
      .filter((o) => onsetScore(o) >= settings.sensitivityDb && o.t >= range.start && o.t <= range.end)
      .filter((o) => !session.offCamera?.some((c) => o.t >= c.start && o.t <= c.end))
      .map((o) => ({ id: `a${Math.round(o.t * 1000)}`, t: o.t, manual: false, level: o.level })),
    ...session.manualShots.map((m) => ({ id: m.id, t: m.t, manual: true, level: null })),
  ]
    .filter((r) => !edits[r.id]?.deleted)
    .sort((a, b) => a.t - b.t)

  // Split into rallies wherever the shuttle goes quiet for long enough.
  const groups: Raw[][] = []
  const cutBetween = (a: number, b: number) => !!session.offCamera?.some((c) => c.start > a && c.start < b)
  for (const r of raws) {
    const g = groups[groups.length - 1]
    const prev = g?.[g.length - 1]
    // A cut to another camera (close-up, replay) always ends the rally.
    if (prev && r.t - prev.t <= settings.rallyGapS && !cutBetween(prev.t, r.t)) g.push(r)
    else groups.push([r])
  }

  // Which side hit first, from manual pins or from loudness (near hits are louder).
  const evidence = groups.map((g) => {
    const pinned = edits[g[0].id]?.side
    if (pinned) return { side: pinned, source: "manual" as const }
    const lv = g.map((r) => r.level)
    // TV footage (it has camera cuts) is mixed from microphones around the
    // court, so near hits are not reliably louder. Tested: wrong on broadcast.
    const tv = !!session.offCamera?.length
    if (!tv && g.length >= 3 && lv.every((l) => l != null)) {
      let even = 0, odd = 0, ne = 0, no = 0
      lv.forEach((l, i) => (i % 2 === 0 ? ((even += l!), ne++) : ((odd += l!), no++)))
      const diff = even / ne - odd / no
      if (Math.abs(diff) >= SOUND_PARITY_DB) return { side: (diff > 0 ? "near" : "far") as Side, source: "sound" as const }
    }
    return null
  })

  const shots: Shot[] = []
  const rallies: Rally[] = []
  const score: Record<Side, number> = { near: 0, far: 0 }
  let prevWinner: Side | null = null
  groups.forEach((g, ri) => {
    const ev = evidence[ri]
    const server: Side = ev?.side ?? prevWinner ?? settings.firstServer
    const serverSource: Rally["serverSource"] = ev ? ev.source : "score"
    const rallyShots: Shot[] = []
    let side = server
    g.forEach((r, i) => {
      if (i > 0) side = edits[r.id]?.side ?? other(side)
      // Doubles: the hitter is the partner who was moving more just before contact.
      let playerIndex = 0
      if (slots === 2) {
        const m0 = movedOver(track, side, 0, r.t - 0.4, r.t)
        const m1 = movedOver(track, side, 1, r.t - 0.4, r.t)
        playerIndex = m1 > m0 ? 1 : 0
      }
      rallyShots.push({
        id: r.id,
        t: r.t,
        side,
        type: "other",
        manual: r.manual,
        typeEdited: false,
        rallyIndex: ri,
        indexInRally: i,
        pos: positionAt(track, side, playerIndex, r.t),
        playerIndex,
        speedKmh: null,
        flightS: null,
        level: r.level,
      })
    })
    rallyShots.forEach((s, i) => {
      const next = rallyShots[i + 1]
      if (next) {
        s.flightS = Math.round((next.t - s.t) * 100) / 100
        if (s.pos && next.pos) {
          const d = Math.hypot(dist(s.pos, next.pos), 1.0)
          s.speedKmh = initialSpeedKmh(d, next.t - s.t)
        }
      }
      const edited = edits[s.id]?.type
      s.type = edited ?? classifyShot({
        hitter: s.pos,
        receiver: next?.pos ?? null,
        flight: s.flightS,
        speed: s.speedKmh,
        first: i === 0,
      })
      s.typeEdited = !!edited
    })

    const id = g[0].id
    const last = rallyShots[rallyShots.length - 1]
    const nextEv = evidence[ri + 1]
    let winner: Side
    let winnerSource: Rally["winnerSource"]
    if (session.winners[id]) { winner = session.winners[id]; winnerSource = "manual" }
    else if (nextEv) { winner = nextEv.side; winnerSource = "next-serve" }
    else { winner = last.side; winnerSource = "last-hitter" }
    score[winner]++
    prevWinner = winner
    rallies.push({
      index: ri,
      id,
      start: g[0].t,
      end: last.t,
      durationS: Math.round((last.t - g[0].t) * 10) / 10,
      shots: rallyShots,
      server,
      serverSource,
      winner,
      winnerSource,
      scoreAfter: { ...score },
    })
    shots.push(...rallyShots)
  })

  const emptyTypes = () => Object.fromEntries(SHOT_TYPES.map((t) => [t, 0])) as Record<ShotType, number>
  const sides = {} as Record<Side, SideStats>
  for (const side of ["near", "far"] as Side[]) {
    const mine = shots.filter((s) => s.side === side)
    const byType = emptyTypes()
    mine.forEach((s) => byType[s.type]++)
    const speeds = mine.map((s) => s.speedKmh).filter((v): v is number => v != null && v > 0)
    const smashes = mine.filter((s) => s.type === "smash" && s.speedKmh != null).map((s) => s.speedKmh!)
    sides[side] = {
      side,
      shots: mine.length,
      byType,
      ralliesWon: rallies.filter((r) => r.winner === side).length,
      fastestKmh: speeds.length ? Math.max(...speeds) : null,
      avgSmashKmh: smashes.length ? Math.round(smashes.reduce((a, b) => a + b, 0) / smashes.length) : null,
    }
  }

  const clipS = Math.max(0, range.end - range.start)
  const players: PlayerStats[] = []
  for (const side of ["near", "far"] as Side[]) {
    for (let slot = 0; slot < slots; slot++) {
      const info = settings.players[side][slot] ?? { name: `${side} ${slot + 1}`, weightKg: 65 }
      const { distance, top, path } = pathStats(track, side, slot)
      const kg = info.weightKg || 65
      players.push({
        side,
        playerIndex: slot,
        name: info.name,
        distanceM: Math.round(distance * 10) / 10,
        // Estimate: on-court activity (~4 kcal/kg/h) plus footwork (~0.9 kcal/kg/km).
        calories: Math.round(kg * ((clipS / 3600) * 4 + (distance / 1000) * 0.9) * 10) / 10,
        avgSpeedMs: clipS ? Math.round((distance / clipS) * 100) / 100 : 0,
        topSpeedMs: Math.round(top * 10) / 10,
        shots: shots.filter((s) => s.side === side && s.playerIndex === slot).length,
        path,
      })
    }
  }

  const fastest = shots.reduce<Shot | null>(
    (best, s) => (s.speedKmh != null && (!best || s.speedKmh > best.speedKmh!) ? s : best),
    null
  )
  const playTimeS = rallies.reduce((a, r) => a + r.durationS, 0)
  return {
    shots,
    rallies,
    sides,
    players,
    totals: {
      shots: shots.length,
      rallies: rallies.length,
      longestRallyShots: rallies.reduce((m, r) => Math.max(m, r.shots.length), 0),
      longestRallyS: rallies.reduce((m, r) => Math.max(m, r.durationS), 0),
      avgShotsPerRally: rallies.length ? Math.round((shots.length / rallies.length) * 10) / 10 : 0,
      tempoShotsPerMin: playTimeS > 0 ? Math.round(((shots.length - rallies.length) / playTimeS) * 600) / 10 : 0,
      fastest,
      playTimeS: Math.round(playTimeS * 10) / 10,
    },
  }
}
