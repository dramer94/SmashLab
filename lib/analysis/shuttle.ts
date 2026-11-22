/**
 * Shuttle tracking without machine learning.
 *
 * The shuttle is a small object that moves fast. Comparing each frame with the
 * frame before AND the frame after ("three-frame difference") keeps only what
 * is at a new place in this frame. Big changed regions are players; the small
 * ones are candidates. Candidates are then linked into smooth flight paths
 * (constant velocity with gravity/drag allowed as small changes), and only
 * paths that look like a flight are kept.
 */

export interface ShuttleCandidate {
  /** Pixel position in the processed frame. */
  x: number
  y: number
  area: number
  /** Strength of the change (mean difference). */
  energy: number
}

export interface ShuttlePoint {
  t: number
  /** Normalised image position (0..1). */
  x: number
  y: number
}

export interface DetectOptions {
  /** Grey-level change that counts as movement. */
  diffT: number
  minArea: number
  maxArea: number
  /** Regions at least this big are people; the area around them is ignored. */
  bigArea: number
  /** Margin (px) around people where candidates are ignored (rackets, arms). */
  personMargin: number
  /** Difference from the empty court that marks a person. */
  bgT: number
  /** How much brighter than the empty court a shuttle must be (it is white). */
  brightT: number
}

export function defaultDetectOptions(w: number): DetectOptions {
  const k = w / 640
  return {
    diffT: 18,
    minArea: 2,
    maxArea: Math.round(45 * k * k),
    bigArea: Math.round(70 * k * k),
    personMargin: Math.round(6 * k),
    bgT: 28,
    brightT: 22,
  }
}

/** Small moving blobs in frame `cur` (grey frames of size w×h). */
export function detectCandidates(
  prev: Uint8Array,
  cur: Uint8Array,
  next: Uint8Array,
  w: number,
  h: number,
  opt: DetectOptions,
  allowed?: (x: number, y: number) => boolean,
  bg?: Uint8Array
): ShuttleCandidate[] {
  const n = w * h
  const mask = new Uint8Array(n)
  let any = false
  for (let i = 0; i < n; i++) {
    const c = cur[i]
    if (Math.abs(c - prev[i]) > opt.diffT && Math.abs(c - next[i]) > opt.diffT) {
      mask[i] = 1
      any = true
    }
  }
  if (!any) return []
  const label = new Int32Array(n).fill(-1)
  const stack: number[] = []
  const comps: { area: number; sx: number; sy: number; e: number; x0: number; x1: number; y0: number; y1: number }[] = []
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s] >= 0) continue
    const id = comps.length
    const comp = { area: 0, sx: 0, sy: 0, e: 0, x0: w, x1: 0, y0: h, y1: 0 }
    label[s] = id
    stack.push(s)
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      const y = (p / w) | 0
      comp.area++
      comp.sx += x
      comp.sy += y
      comp.e += Math.abs(cur[p] - prev[p]) + Math.abs(cur[p] - next[p])
      if (x < comp.x0) comp.x0 = x
      if (x > comp.x1) comp.x1 = x
      if (y < comp.y0) comp.y0 = y
      if (y > comp.y1) comp.y1 = y
      // 8-connected, but bail out of huge regions early by not caring: they are rare.
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const q = ny * w + nx
          if (mask[q] && label[q] < 0) {
            label[q] = id
            stack.push(q)
          }
        }
      }
    }
    comps.push(comp)
  }
  const people: { x0: number; x1: number; y0: number; y1: number }[] = comps.filter((c) => c.area >= opt.bigArea)
  if (bg) people.push(...personBoxes(cur, bg, w, h, opt))
  const m = opt.personMargin
  // A swinging racket reaches about an arm's length out: scale the no-go zone with the person.
  const nearPerson = (x: number, y: number) =>
    people.some((p) => {
      const ph = p.y1 - p.y0
      const mx = m + 0.22 * ph
      const my = m + 0.18 * ph
      return x >= p.x0 - mx && x <= p.x1 + mx && y >= p.y0 - my && y <= p.y1 + m
    })
  const out: ShuttleCandidate[] = []
  for (const c of comps) {
    if (c.area < opt.minArea || c.area > opt.maxArea) continue
    // A shuttle is compact; long thin streaks are lines/edges flickering.
    const bw = c.x1 - c.x0 + 1
    const bh = c.y1 - c.y0 + 1
    if (Math.max(bw, bh) > 4 * Math.sqrt(opt.maxArea)) continue
    const x = c.sx / c.area
    const y = c.sy / c.area
    if (nearPerson(x, y)) continue
    if (allowed && !allowed(x, y)) continue
    if (bg) {
      // White shuttle: brighter than the empty court behind it.
      let lift = -255
      const cx = Math.round(x), cy = Math.round(y)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx, yy = cy + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const q = yy * w + xx
          lift = Math.max(lift, cur[q] - bg[q])
        }
      }
      if (lift < opt.brightT) continue
    }
    out.push({ x, y, area: c.area, energy: c.e / (2 * c.area) })
  }
  return out
}

/** Boxes around people: big regions that differ from the empty court. Coarse 4×4 grid for speed. */
function personBoxes(cur: Uint8Array, bg: Uint8Array, w: number, h: number, opt: DetectOptions) {
  const C = 4
  const gw = Math.floor(w / C), gh = Math.floor(h / C)
  const on = new Uint8Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let c = 0
      for (let y = gy * C; y < gy * C + C; y++) {
        const row = y * w
        for (let x = gx * C; x < gx * C + C; x++) if (Math.abs(cur[row + x] - bg[row + x]) > opt.bgT) c++
      }
      if (c >= 5) on[gy * gw + gx] = 1
    }
  }
  const seen = new Uint8Array(gw * gh)
  const boxes: { x0: number; x1: number; y0: number; y1: number; area: number }[] = []
  const minCells = Math.max(3, opt.bigArea / (C * C))
  const st: number[] = []
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || seen[i]) continue
    let x0 = gw, x1 = 0, y0 = gh, y1 = 0, cells = 0
    seen[i] = 1
    st.push(i)
    while (st.length) {
      const c = st.pop()!
      const cx = c % gw, cy = (c / gw) | 0
      cells++
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
        const q = ny * gw + nx
        if (on[q] && !seen[q]) { seen[q] = 1; st.push(q) }
      }
    }
    if (cells >= minCells) boxes.push({ x0: x0 * C, x1: x1 * C + C, y0: y0 * C, y1: y1 * C + C, area: cells * C * C })
  }
  return boxes
}

interface Track {
  pts: { f: number; x: number; y: number; e: number }[]
  vx: number
  vy: number
  missed: number
}

export interface LinkOptions {
  /** Largest move (px per frame) for the first step of a track. */
  maxStep: number
  /** Allowed miss between predicted and found position (px). */
  gate: number
  /** Frames a track may go unseen (shuttle behind a player, blur). */
  maxMissed: number
  minLength: number
}

export function defaultLinkOptions(w: number): LinkOptions {
  const k = w / 640
  return { maxStep: 48 * k, gate: 9 * k, maxMissed: 3, minLength: 8 }
}

/**
 * Links per-frame candidates into flight paths and returns, per frame, the
 * shuttle position (pixels) or null. `cands[f]` are the candidates of frame f.
 */
export function linkTracks(cands: ShuttleCandidate[][], opt: LinkOptions): ({ x: number; y: number } | null)[] {
  const done: Track[] = []
  let active: Track[] = []
  for (let f = 0; f < cands.length; f++) {
    const cs = cands[f]
    const used = new Set<number>()
    // Extend existing tracks, best match first.
    const pairs: { ti: number; ci: number; d: number }[] = []
    active.forEach((tr, ti) => {
      const last = tr.pts[tr.pts.length - 1]
      const steps = f - last.f
      const px = last.x + tr.vx * steps
      const py = last.y + tr.vy * steps
      const g = tr.pts.length >= 2 ? opt.gate * (1 + 0.5 * (steps - 1)) + 0.25 * Math.hypot(tr.vx, tr.vy) : opt.maxStep * steps
      cs.forEach((c, ci) => {
        const d = Math.hypot(c.x - px, c.y - py)
        if (d <= g) pairs.push({ ti, ci, d: tr.pts.length >= 2 ? d : d - 1000 * 0 })
      })
    })
    pairs.sort((a, b) => a.d - b.d)
    const extended = new Set<number>()
    for (const p of pairs) {
      if (extended.has(p.ti) || used.has(p.ci)) continue
      const tr = active[p.ti]
      const c = cs[p.ci]
      const last = tr.pts[tr.pts.length - 1]
      const steps = f - last.f
      const nvx = (c.x - last.x) / steps
      const nvy = (c.y - last.y) / steps
      // Velocity is smoothed; a sudden reversal means it is not the same object.
      if (tr.pts.length >= 2) {
        const dot = nvx * tr.vx + nvy * tr.vy
        if (dot < 0 && Math.hypot(tr.vx, tr.vy) > 4) continue
        tr.vx = 0.6 * nvx + 0.4 * tr.vx
        tr.vy = 0.6 * nvy + 0.4 * tr.vy
      } else {
        tr.vx = nvx
        tr.vy = nvy
      }
      tr.pts.push({ f, x: c.x, y: c.y, e: c.energy })
      tr.missed = 0
      extended.add(p.ti)
      used.add(p.ci)
    }
    const still: Track[] = []
    active.forEach((tr, ti) => {
      if (!extended.has(ti)) tr.missed++
      if (tr.missed > opt.maxMissed || (tr.pts.length === 1 && tr.missed > 1)) done.push(tr)
      else still.push(tr)
    })
    active = still
    cs.forEach((c, ci) => {
      if (!used.has(ci)) active.push({ pts: [{ f, x: c.x, y: c.y, e: c.energy }], vx: 0, vy: 0, missed: 0 })
    })
  }
  done.push(...active)

  // Keep flight-like tracks: long enough, really moving, and not jittering in place.
  const good = done.filter((tr) => {
    if (tr.pts.length < opt.minLength) return false
    const a = tr.pts[0]
    const b = tr.pts[tr.pts.length - 1]
    const net = Math.hypot(b.x - a.x, b.y - a.y)
    let path = 0
    for (let i = 1; i < tr.pts.length; i++) path += Math.hypot(tr.pts[i].x - tr.pts[i - 1].x, tr.pts[i].y - tr.pts[i - 1].y)
    return net >= opt.gate * 5 && net / path > 0.7
  })

  const out: ({ x: number; y: number } | null)[] = Array(cands.length).fill(null)
  const owner: number[] = Array(cands.length).fill(0)
  for (const tr of good) {
    const len = tr.pts.length
    for (let i = 0; i < tr.pts.length; i++) {
      const p = tr.pts[i]
      if (out[p.f] && owner[p.f] >= len) continue
      out[p.f] = { x: p.x, y: p.y }
      owner[p.f] = len
      // Fill short gaps inside the track.
      const q = tr.pts[i + 1]
      if (q && q.f - p.f > 1) {
        for (let g = p.f + 1; g < q.f; g++) {
          if (out[g] && owner[g] >= len) continue
          const k = (g - p.f) / (q.f - p.f)
          out[g] = { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }
          owner[g] = len
        }
      }
    }
  }
  return out
}
