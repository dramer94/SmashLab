import { applyHomography, computeHomography, COURT_CORNERS, COURT_L, COURT_W, dist, NET_Y } from "./geometry"
import type { MatchFormat, Pt, Side, TrackFrame } from "./types"

/**
 * Player tracking by background subtraction. The camera is assumed to be
 * still (tripod or propped phone), so a per-pixel median over frames spread
 * across the clip is an empty-court background. Anything that differs from it
 * is a moving person; the lowest point of each blob is where their feet touch
 * the floor, which the court homography turns into metres on court.
 */

const CELL = 4
const DIFF_T = 70

export interface Blob {
  /** Foot point, normalised image coords (0..1). */
  foot: Pt
  area: number
  /** Bounding box in cells. */
  x0: number
  x1: number
  y0: number
  y1: number
}

export function medianBackground(frames: Uint8ClampedArray[], len: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(len)
  const n = frames.length
  const tmp = new Uint8Array(n)
  for (let i = 0; i < len; i++) {
    if ((i & 3) === 3) { out[i] = 255; continue }
    for (let f = 0; f < n; f++) tmp[f] = frames[f][i]
    tmp.sort()
    out[i] = tmp[n >> 1]
  }
  return out
}

/** Finds person-sized foreground blobs. Returns blobs plus the foreground share. */
export function detectBlobs(
  frame: Uint8ClampedArray,
  bg: Uint8ClampedArray,
  w: number,
  h: number,
  minAreaCells = 4
): { blobs: Blob[]; fgShare: number } {
  const gw = Math.floor(w / CELL)
  const gh = Math.floor(h / CELL)
  const counts = new Uint8Array(gw * gh)
  let fgPixels = 0
  for (let y = 0; y < gh * CELL; y++) {
    const row = y * w
    const gy = ((y / CELL) | 0) * gw
    for (let x = 0; x < gw * CELL; x++) {
      const i = (row + x) * 4
      const r = frame[i], g = frame[i + 1], b = frame[i + 2]
      const R = bg[i], G = bg[i + 1], B = bg[i + 2]
      const d = Math.abs(r - R) + Math.abs(g - G) + Math.abs(b - B)
      if (d <= DIFF_T) continue
      // Shadows: same colour, just darker. Skip them so feet stay on the floor.
      const s = r + g + b
      const S = R + G + B + 1
      const ratio = s / S
      if (ratio > 0.4 && ratio < 0.95) {
        const cd =
          Math.abs(r / (s + 1) - R / S) + Math.abs(g / (s + 1) - G / S) + Math.abs(b / (s + 1) - B / S)
        if (cd < 0.06) continue
      }
      fgPixels++
      counts[gy + ((x / CELL) | 0)]++
    }
  }
  const on = new Uint8Array(gw * gh)
  for (let i = 0; i < on.length; i++) on[i] = counts[i] >= 5 ? 1 : 0

  // 8-connected components on the cell grid.
  const label = new Int32Array(gw * gh).fill(-1)
  const comps: { cells: number[]; x0: number; x1: number; y0: number; y1: number }[] = []
  const stack: number[] = []
  for (let start = 0; start < on.length; start++) {
    if (!on[start] || label[start] >= 0) continue
    const id = comps.length
    const comp = { cells: [] as number[], x0: gw, x1: 0, y0: gh, y1: 0 }
    label[start] = id
    stack.push(start)
    while (stack.length) {
      const c = stack.pop()!
      comp.cells.push(c)
      const cx = c % gw
      const cy = (c / gw) | 0
      if (cx < comp.x0) comp.x0 = cx
      if (cx > comp.x1) comp.x1 = cx
      if (cy < comp.y0) comp.y0 = cy
      if (cy > comp.y1) comp.y1 = cy
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
          const ni = ny * gw + nx
          if (on[ni] && label[ni] < 0) { label[ni] = id; stack.push(ni) }
        }
      }
    }
    comps.push(comp)
  }

  // Bodies often split (shirt vs shorts vs legs); join pieces stacked vertically.
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < comps.length; i++) {
      for (let j = i + 1; j < comps.length; j++) {
        const a = comps[i], b = comps[j]
        const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1
        const minW = Math.min(a.x1 - a.x0, b.x1 - b.x0) + 1
        const gap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1) - 1
        if (overlap >= Math.max(1, minW * 0.4) && gap <= 2) {
          a.cells.push(...b.cells)
          a.x0 = Math.min(a.x0, b.x0); a.x1 = Math.max(a.x1, b.x1)
          a.y0 = Math.min(a.y0, b.y0); a.y1 = Math.max(a.y1, b.y1)
          comps.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }

  const blobs: Blob[] = []
  for (const c of comps) {
    if (c.cells.length < minAreaCells) continue
    // Foot: average x of the bottom two rows, bottom edge of the blob.
    let sx = 0, n = 0
    for (const cell of c.cells) {
      const cy = (cell / gw) | 0
      if (cy >= c.y1 - 1) { sx += (cell % gw) + 0.5; n++ }
    }
    blobs.push({
      foot: { x: ((sx / n) * CELL) / w, y: ((c.y1 + 1) * CELL) / h },
      area: c.cells.length,
      x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1,
    })
  }
  return { blobs, fgShare: fgPixels / (w * h) }
}

interface Candidate { p: Pt; area: number }

function inPlayArea(p: Pt) {
  return p.x > -1.2 && p.x < COURT_W + 1.2 && p.y > -1.8 && p.y < COURT_L + 1.8
}

/** Groups blobs by court side, merging pieces less than 0.7 m apart. */
export function candidatesBySide(blobs: Blob[], H: number[]): Record<Side, Candidate[]> {
  const out: Record<Side, Candidate[]> = { near: [], far: [] }
  for (const b of blobs) {
    const p = applyHomography(H, b.foot)
    if (!Number.isFinite(p.x) || !inPlayArea(p)) continue
    const side: Side = p.y >= NET_Y ? "near" : "far"
    const list = out[side]
    const close = list.find((c) => dist(c.p, p) < 0.7)
    if (close) {
      if (b.area > close.area) close.p = p
      close.area += b.area
    } else list.push({ p, area: b.area })
  }
  out.near.sort((a, b) => b.area - a.area)
  out.far.sort((a, b) => b.area - a.area)
  return out
}

/** Frame-to-frame association for one side of the court. */
export class SideTracker {
  prev: (Pt | null)[]
  lastSeen: number[]
  constructor(private slots: number) {
    this.prev = Array(slots).fill(null)
    this.lastSeen = Array(slots).fill(-Infinity)
  }

  update(t: number, cands: Candidate[]): (Pt | null)[] {
    const maxArea = cands[0]?.area ?? 0
    const pool = cands.filter((c) => c.area >= maxArea * 0.25).slice(0, 4)
    const gate = (i: number) => 1.2 + 7 * Math.min(2, t - this.lastSeen[i])
    let best: (Candidate | null)[] = Array(this.slots).fill(null)
    let bestCost = Infinity
    const assign = (slot: number, used: Set<number>, cur: (Candidate | null)[], cost: number) => {
      if (cost >= bestCost) return
      if (slot === this.slots) { bestCost = cost; best = cur.slice(); return }
      const prev = this.prev[slot]
      // Option: nothing seen for this slot.
      cur[slot] = null
      assign(slot + 1, used, cur, cost + 2.5)
      for (let k = 0; k < pool.length; k++) {
        if (used.has(k)) continue
        const c = pool[k]
        let cst: number
        if (prev) {
          const d = dist(prev, c.p)
          const stale = t - this.lastSeen[slot] > 1.0
          if (d > gate(slot) && !stale) continue
          cst = stale ? 1.5 - 0.5 * (c.area / (maxArea + 1)) : d
        } else cst = 1.0 - Math.min(0.9, c.area / (maxArea + 1)) // prefer big blobs
        used.add(k)
        cur[slot] = c
        assign(slot + 1, used, cur, cost + cst)
        used.delete(k)
      }
      cur[slot] = null
    }
    assign(0, new Set(), Array(this.slots).fill(null), 0)
    return best.map((c, i) => {
      if (!c) return null
      this.prev[i] = c.p
      this.lastSeen[i] = t
      return c.p
    })
  }
}

/** Fill short gaps by interpolation and smooth with a 5-sample median. */
export function smoothTrack(frames: TrackFrame[], maxGapS = 0.8): TrackFrame[] {
  const out: TrackFrame[] = frames.map((f) => ({ t: f.t, near: [...f.near], far: [...f.far] }))
  for (const side of ["near", "far"] as Side[]) {
    const slots = out[0]?.[side].length ?? 0
    for (let s = 0; s < slots; s++) {
      // Interpolate gaps.
      let lastIdx = -1
      for (let i = 0; i < out.length; i++) {
        const p = out[i][side][s]
        if (!p) continue
        if (lastIdx >= 0 && i - lastIdx > 1 && out[i].t - out[lastIdx].t <= maxGapS) {
          const a = out[lastIdx][side][s]!
          for (let k = lastIdx + 1; k < i; k++) {
            const f = (out[k].t - out[lastIdx].t) / (out[i].t - out[lastIdx].t)
            out[k][side][s] = { x: a.x + (p.x - a.x) * f, y: a.y + (p.y - a.y) * f }
          }
        }
        lastIdx = i
      }
      // Median filter.
      const raw = out.map((f) => f[side][s])
      for (let i = 0; i < out.length; i++) {
        if (!raw[i]) continue
        const xs: number[] = [], ys: number[] = []
        for (let k = i - 2; k <= i + 2; k++) {
          const p = raw[k]
          if (p) { xs.push(p.x); ys.push(p.y) }
        }
        xs.sort((a, b) => a - b); ys.sort((a, b) => a - b)
        out[i][side][s] = {
          x: Math.round(xs[xs.length >> 1] * 100) / 100,
          y: Math.round(ys[ys.length >> 1] * 100) / 100,
        }
      }
    }
  }
  return out
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, 4000)
    video.addEventListener("seeked", done)
    video.currentTime = t
  })
}

export interface TrackResult {
  track: TrackFrame[]
  detection: Record<Side, number>
  warnings: string[]
}

export async function trackPlayers(
  video: HTMLVideoElement,
  corners: Pt[],
  range: { start: number; end: number },
  format: MatchFormat,
  onProgress: (stage: string, frac: number) => void,
  signal?: AbortSignal,
  fps = 10
): Promise<TrackResult> {
  const H = computeHomography(corners, COURT_CORNERS)
  if (!H) throw new Error("Court marks do not form a valid court shape.")
  const w = Math.min(480, video.videoWidth || 480)
  const h = Math.round((w * (video.videoHeight || 270)) / (video.videoWidth || 480))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const grab = () => {
    ctx.drawImage(video, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h).data
  }
  const len = w * h * 4
  const span = range.end - range.start

  onProgress("Reading the empty court", 0)
  const bgFrames: Uint8ClampedArray[] = []
  const nBg = 31
  for (let i = 0; i < nBg; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    await seekTo(video, range.start + (span * (i + 0.5)) / nBg)
    bgFrames.push(new Uint8ClampedArray(grab()))
    onProgress("Reading the empty court", (i + 1) / nBg)
  }
  const bg = medianBackground(bgFrames, len)
  bgFrames.length = 0

  const slots = format === "doubles" ? 2 : 1
  const trackers: Record<Side, SideTracker> = { near: new SideTracker(slots), far: new SideTracker(slots) }
  const raw: TrackFrame[] = []
  const seen: Record<Side, number> = { near: 0, far: 0 }
  const shares: number[] = []
  const step = 1 / fps
  const total = Math.max(1, Math.floor(span / step))
  for (let i = 0; i <= total; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    const t = Math.min(range.end, range.start + i * step)
    await seekTo(video, t)
    const { blobs, fgShare } = detectBlobs(grab(), bg, w, h)
    shares.push(fgShare)
    const cands = candidatesBySide(blobs, H)
    const near = trackers.near.update(t, cands.near)
    const far = trackers.far.update(t, cands.far)
    seen.near += near.filter(Boolean).length / slots
    seen.far += far.filter(Boolean).length / slots
    raw.push({ t: Math.round(t * 1000) / 1000, near, far })
    if (i % 3 === 0) onProgress("Tracking players", i / total)
  }

  const n = raw.length || 1
  const detection = { near: seen.near / n, far: seen.far / n }
  const warnings: string[] = []
  shares.sort((a, b) => a - b)
  if ((shares[shares.length >> 1] ?? 0) > 0.12) {
    warnings.push(
      "The camera seems to move or the lighting changes a lot, so player tracking may be off. Film from a tripod or a steady spot with the whole court in view."
    )
  }
  for (const side of ["near", "far"] as Side[]) {
    if (detection[side] < 0.5) {
      warnings.push(
        `Players on the ${side} side were found in only ${Math.round(detection[side] * 100)}% of frames. Check the court marks sit exactly on the corners.`
      )
    }
  }
  return { track: smoothTrack(raw), detection, warnings }
}
