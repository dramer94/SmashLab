import type { Onset } from "./types"

/** Lowest attack sharpness kept as a candidate; the UI filters above this. */
export const MIN_CANDIDATE_RISE_DB = 6

/**
 * Detection score used by the sensitivity filter: how far a hit stands out
 * from the surrounding second of sound. Applause and chatter keep the whole
 * second loud, so their claps score low; a racket hit in a quiet hall scores
 * high. Older saved analyses have no contrast and fall back to the rise.
 */
export function onsetScore(o: Onset): number {
  if (o.contrast == null) return o.rise
  // Sounds made over a loud crowd (applause, cheering) are not hits.
  if (o.level - o.contrast > CROWD_BG_DB) return 0
  return o.contrast
}

/**
 * Background (median of the surrounding 1.2 s, relative to the clip's typical
 * level) above which a sound is treated as crowd noise. Measured: applause and
 * cheering sat at 11–18 dB, real hits at most 7.7 dB (amateur and broadcast).
 */
const CROWD_BG_DB = 9.5
const HOP_S = 0.005
const MIN_GAP_S = 0.22

/** Second-order high-pass (RBJ cookbook), applied in place. */
function highpass(x: Float32Array, sr: number, fc: number) {
  const w0 = (2 * Math.PI * fc) / sr
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2)
  const a0 = 1 + alpha
  const b0 = (1 + cos) / 2 / a0
  const b1 = -(1 + cos) / a0
  const b2 = (1 + cos) / 2 / a0
  const a1 = (-2 * cos) / a0
  const a2 = (1 - alpha) / a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = xi; y2 = y1; y1 = yi
    x[i] = yi
  }
}

/**
 * Finds sharp high-frequency transients (racket-on-shuttle "tock" sounds).
 * `samples` is mono audio starting at `offsetS` seconds of video time.
 */
export function detectOnsets(samples: Float32Array, sr: number, offsetS = 0): Onset[] {
  const x = new Float32Array(samples)
  highpass(x, sr, 2000)
  highpass(x, sr, 2000)

  const hop = Math.max(1, Math.round(sr * HOP_S))
  const win = hop * 2
  const n = Math.floor((x.length - win) / hop)
  if (n < 20) return []
  const db = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    let e = 0
    const s = k * hop
    for (let i = s; i < s + win; i++) e += x[i] * x[i]
    db[k] = 10 * Math.log10(e / win + 1e-12)
  }

  // Loudness floor: ignore anything near the quiet background level.
  const sorted = Array.from(db).sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.5)]

  // Novelty = how far this frame jumps above the frames just before it.
  const nov = new Float32Array(n)
  for (let k = 12; k < n; k++) {
    let base = 0
    for (let j = k - 12; j <= k - 3; j++) base += db[j]
    base /= 10
    nov[k] = Math.max(0, Math.max(db[k], db[k + 1] ?? db[k]) - base)
  }

  const peaks: Onset[] = []
  const ctxR = Math.round(0.6 / HOP_S)
  const radius = Math.round(0.06 / HOP_S)
  for (let k = 12; k < n; k++) {
    const v = nov[k]
    if (v < MIN_CANDIDATE_RISE_DB) continue
    let isMax = true
    for (let j = Math.max(0, k - radius); j <= Math.min(n - 1, k + radius); j++) {
      if (nov[j] > v || (nov[j] === v && j < k)) { isMax = false; break }
    }
    if (!isMax) continue
    let level = -Infinity
    for (let j = k; j < Math.min(n, k + 6); j++) level = Math.max(level, db[j])
    if (level < floor + 6) continue
    peaks.push({
      t: round3(offsetS + (k * hop + hop) / sr),
      rise: round1(v),
      level: round1(level - floor),
      contrast: round1(level - localMedian(db, k, ctxR)),
    })
  }

  // Keep the strongest within any MIN_GAP_S window.
  const out: Onset[] = []
  for (const p of peaks) {
    const last = out[out.length - 1]
    if (last && p.t - last.t < MIN_GAP_S) {
      if (p.rise > last.rise) out[out.length - 1] = p
    } else out.push(p)
  }
  return out
}

/** Decodes the file's audio and returns mono samples for [start, end]. */
export async function decodeAudio(
  file: Blob,
  start: number,
  end: number
): Promise<{ samples: Float32Array; sampleRate: number } | null> {
  const AC: typeof AudioContext | undefined =
    typeof window !== "undefined"
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined
  if (!AC) return null
  const ctx = new AC()
  try {
    const buf = await file.arrayBuffer()
    const audio = await ctx.decodeAudioData(buf)
    const sr = audio.sampleRate
    const s0 = Math.max(0, Math.floor(start * sr))
    const s1 = Math.min(audio.length, Math.ceil(end * sr))
    if (s1 - s0 < sr * 0.5) return null
    const mono = new Float32Array(s1 - s0)
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c)
      for (let i = s0; i < s1; i++) mono[i - s0] += ch[i] / audio.numberOfChannels
    }
    return { samples: mono, sampleRate: sr }
  } catch {
    return null
  } finally {
    ctx.close().catch(() => {})
  }
}

/** Median loudness in the ±0.6 s around frame k: high during applause or chatter. */
function localMedian(db: Float32Array, k: number, r: number) {
  const a: number[] = []
  for (let j = Math.max(0, k - r); j <= Math.min(db.length - 1, k + r); j += 2) a.push(db[j])
  a.sort((x, y) => x - y)
  return a[a.length >> 1]
}

function round1(v: number) { return Math.round(v * 10) / 10 }
function round3(v: number) { return Math.round(v * 1000) / 1000 }
