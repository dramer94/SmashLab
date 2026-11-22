// Shared types for the Rally Analysis feature.
// Court coordinates are in metres: x runs across the court (0 = left doubles
// sideline as seen from the camera, 6.1 = right), y runs along it (0 = far
// baseline, 13.4 = near baseline). The net sits at y = 6.7.

export interface Pt {
  x: number
  y: number
}

export type Side = "near" | "far"
export type MatchFormat = "singles" | "doubles"

export const SHOT_TYPES = [
  "serve",
  "clear",
  "smash",
  "drop",
  "net",
  "lift",
  "drive",
  "push",
  "other",
] as const
export type ShotType = (typeof SHOT_TYPES)[number]

/** A shot-sound candidate found in the audio track. */
export interface Onset {
  /** Seconds, absolute video time. */
  t: number
  /** Sharpness of the sound's attack in dB (used by the sensitivity filter). */
  rise: number
  /** Loudness of the hit in dB (relative). Near-side hits are louder. */
  level: number
  /** How far the hit stands out from the surrounding second of sound (dB). */
  contrast?: number
}

/** Player positions on court at one sampled frame. null = not seen. */
export interface TrackFrame {
  t: number
  near: (Pt | null)[]
  far: (Pt | null)[]
}

export interface PlayerInfo {
  name: string
  weightKg: number
}

/** Per-shot manual corrections, keyed by shot id. */
export interface ShotEdit {
  type?: ShotType
  /** Pins this shot's hitting side; later shots in the rally alternate from it. */
  side?: Side
  deleted?: boolean
}

export interface AnalysisSettings {
  format: MatchFormat
  /** Minimum detection score (dB, see onsetScore) for a sound to count as a shot. */
  sensitivityDb: number
  /** Silence (s) that ends a rally. */
  rallyGapS: number
  firstServer: Side
  players: Record<Side, PlayerInfo[]>
}

export interface VideoMeta {
  name: string
  size: number
  lastModified: number
  duration: number
  width: number
  height: number
}

export interface Session {
  version: 1
  id: string
  createdAt: number
  updatedAt: number
  video: VideoMeta
  range: { start: number; end: number }
  /** Image corners, normalised 0..1: far-left, far-right, near-right, near-left. */
  corners: Pt[]
  settings: AnalysisSettings
  onsets: Onset[]
  track: TrackFrame[]
  /** Fraction of sampled frames in which each side was detected. */
  detection: Record<Side, number>
  warnings: string[]
  manualShots: { id: string; t: number }[]
  edits: Record<string, ShotEdit>
  /** Rally winner overrides keyed by the rally's first shot id. */
  winners: Record<string, Side>
  hasAudio: boolean
}

export interface Shot {
  id: string
  t: number
  side: Side
  type: ShotType
  manual: boolean
  typeEdited: boolean
  rallyIndex: number
  indexInRally: number
  /** Hitter position on court (metres), if tracked. */
  pos: Pt | null
  /** Index of the hitting player within the side (doubles), if known. */
  playerIndex: number
  /** Estimated initial shuttle speed, km/h. */
  speedKmh: number | null
  flightS: number | null
  level: number | null
}

export interface Rally {
  index: number
  id: string
  start: number
  end: number
  shots: Shot[]
  server: Side
  winner: Side
  winnerSource: "manual" | "next-serve" | "last-hitter"
  serverSource: "manual" | "sound" | "score"
  durationS: number
  scoreAfter: Record<Side, number>
}

export interface PlayerStats {
  side: Side
  playerIndex: number
  name: string
  distanceM: number
  calories: number
  avgSpeedMs: number
  topSpeedMs: number
  shots: number
  /** Points on court (metres) for the heatmap / path. */
  path: Pt[]
}

export interface SideStats {
  side: Side
  shots: number
  byType: Record<ShotType, number>
  ralliesWon: number
  fastestKmh: number | null
  avgSmashKmh: number | null
}

export interface AnalysisResult {
  shots: Shot[]
  rallies: Rally[]
  sides: Record<Side, SideStats>
  players: PlayerStats[]
  totals: {
    shots: number
    rallies: number
    longestRallyShots: number
    longestRallyS: number
    avgShotsPerRally: number
    tempoShotsPerMin: number
    fastest: Shot | null
    playTimeS: number
  }
}
