import { SHOT_TYPES, type AnalysisResult, type Session, type ShotType, type Side } from "./types"

/** What gets saved to a profile for one analysed video: numbers only. */
export interface PlayStatInput {
  analysisId: string
  videoName: string
  format: "singles" | "doubles"
  side: Side
  slot: number
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
  topSpeedMs: number
  shotTypes: Record<ShotType, number>
}

/** Stats of the player the user says they are. */
export function statFromResult(result: AnalysisResult, session: Session, side: Side, slot: number): PlayStatInput {
  const doubles = session.settings.format === "doubles"
  const mine = result.shots.filter((s) => s.side === side && (!doubles || s.playerIndex === slot))
  const shotTypes = Object.fromEntries(SHOT_TYPES.map((t) => [t, mine.filter((s) => s.type === t).length])) as Record<ShotType, number>
  const smashSpeeds = mine.filter((s) => s.type === "smash" && s.speedKmh).map((s) => s.speedKmh!)
  const speeds = mine.map((s) => s.speedKmh).filter((v): v is number => v != null)
  const p = result.players.find((x) => x.side === side && x.playerIndex === slot)
  const opp: Side = side === "near" ? "far" : "near"
  return {
    analysisId: session.id,
    videoName: session.video.name.slice(0, 200),
    format: session.settings.format,
    side,
    slot,
    playerName: (session.settings.players[side][slot]?.name ?? side).slice(0, 60),
    durationS: Math.round((session.range.end - session.range.start) * 10) / 10,
    rallies: result.totals.rallies,
    pointsWon: result.sides[side].ralliesWon,
    pointsLost: result.sides[opp].ralliesWon,
    shots: mine.length,
    smashes: shotTypes.smash,
    fastestKmh: speeds.length ? Math.max(...speeds) : null,
    avgSmashKmh: smashSpeeds.length ? Math.round(smashSpeeds.reduce((a, b) => a + b, 0) / smashSpeeds.length) : null,
    distanceM: p?.distanceM ?? 0,
    calories: p?.calories ?? 0,
    topSpeedMs: p?.topSpeedMs ?? 0,
    shotTypes,
  }
}

const num = (v: unknown, lo: number, hi: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null
}
const int = (v: unknown, lo: number, hi: number) => {
  const n = num(v, lo, hi)
  return n == null ? null : Math.round(n)
}
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

/** Server-side check of a posted stat; returns null when anything is off. */
export function parsePlayStat(b: Record<string, unknown>): PlayStatInput | null {
  const side = b.side === "near" || b.side === "far" ? b.side : null
  const format = b.format === "singles" || b.format === "doubles" ? b.format : null
  const analysisId = str(b.analysisId, 64)
  const videoName = str(b.videoName, 200) ?? "video"
  const playerName = str(b.playerName, 60)
  const values = {
    slot: int(b.slot, 0, 1),
    durationS: num(b.durationS, 0, 3600),
    rallies: int(b.rallies, 0, 10000),
    pointsWon: int(b.pointsWon, 0, 10000),
    pointsLost: int(b.pointsLost, 0, 10000),
    shots: int(b.shots, 0, 100000),
    smashes: int(b.smashes, 0, 100000),
    distanceM: num(b.distanceM, 0, 100000),
    calories: num(b.calories, 0, 100000),
    topSpeedMs: num(b.topSpeedMs, 0, 15),
  }
  if (!side || !format || !analysisId || !playerName || Object.values(values).some((v) => v == null)) return null
  const types = (b.shotTypes ?? {}) as Record<string, unknown>
  const shotTypes = Object.fromEntries(SHOT_TYPES.map((t) => [t, int(types[t], 0, 100000) ?? 0])) as Record<ShotType, number>
  return {
    analysisId,
    videoName,
    format,
    side,
    playerName,
    slot: values.slot!,
    durationS: values.durationS!,
    rallies: values.rallies!,
    pointsWon: values.pointsWon!,
    pointsLost: values.pointsLost!,
    shots: values.shots!,
    smashes: values.smashes!,
    fastestKmh: b.fastestKmh == null ? null : int(b.fastestKmh, 0, 500),
    avgSmashKmh: b.avgSmashKmh == null ? null : int(b.avgSmashKmh, 0, 500),
    distanceM: values.distanceM!,
    calories: values.calories!,
    topSpeedMs: values.topSpeedMs!,
    shotTypes,
  }
}

/** Monday 00:00 of the current week in Malaysia time (UTC+8), as a UTC Date. */
export function weekStart(now = new Date()): Date {
  const myt = new Date(now.getTime() + 8 * 3600e3)
  const day = (myt.getUTCDay() + 6) % 7 // Monday = 0
  const start = Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate() - day) - 8 * 3600e3
  return new Date(start)
}
