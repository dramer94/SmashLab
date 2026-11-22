import { applyHomography, computeHomography, COURT_L, COURT_W, courtLines, dist, markPoints, type Homography } from "./geometry"
import { positionAt, SHOT_LABELS } from "./engine"
import type { AnalysisResult, Pt, Session, Shot, Side } from "./types"

/** Playback speed of slow-motion replays. */
export const REPLAY_RATE = 0.35
/** Seconds of play shown before / after the replayed shot. */
export const REPLAY_BEFORE = 1.2
export const REPLAY_AFTER = 0.8

export const SIDE_COLORS: Record<Side, string> = { near: "#3987e5", far: "#d95926" }

export interface OverlayOptions {
  courtLines: boolean
  miniMap: boolean
  labels: boolean
}

export interface OverlayModel {
  session: Session
  result: AnalysisResult
  courtToImage: Homography | null
  /** Cumulative running distance per player, aligned with session.track. */
  cumulative: Record<string, number[]>
}

export function buildOverlayModel(session: Session, result: AnalysisResult): OverlayModel {
  const courtToImage = computeHomography(markPoints(session.marks), session.corners)
  const cumulative: Record<string, number[]> = {}
  const slots = session.settings.format === "doubles" ? 2 : 1
  for (const side of ["near", "far"] as Side[]) {
    for (let s = 0; s < slots; s++) {
      const arr: number[] = []
      let total = 0
      let anchor: Pt | null = null
      let anchorT = 0
      for (const f of session.track) {
        const p = f[side][s]
        if (p) {
          if (!anchor || f.t - anchorT > 1.5) { anchor = p; anchorT = f.t }
          else {
            const d = dist(anchor, p)
            if (d >= 0.25) {
              if (d / Math.max(f.t - anchorT, 0.05) <= 8.5) total += d
              anchor = p
              anchorT = f.t
            }
          }
        }
        arr.push(total)
      }
      cumulative[`${side}${s}`] = arr
    }
  }
  return { session, result, courtToImage, cumulative }
}

function trackIndexAt(track: { t: number }[], t: number) {
  let lo = 0, hi = track.length - 1
  if (hi < 0) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (track[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Draws the analysis overlay for video time `t` onto a canvas of size W×H. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  model: OverlayModel,
  opts: OverlayOptions,
  replay: Shot | null = null
) {
  const { session, result, courtToImage } = model
  const toImg = (p: Pt) => {
    const q = applyHomography(courtToImage!, p)
    return { x: q.x * W, y: q.y * H }
  }
  const u = Math.max(1, W / 960) // scale unit so the HUD looks the same at any size
  const offCam = !!session.offCamera?.some((c) => t >= c.start && t <= c.end)
  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  if (courtToImage && opts.courtLines && !offCam) {
    ctx.strokeStyle = "rgba(250, 204, 21, 0.55)"
    for (const line of courtLines()) {
      ctx.lineWidth = (line.kind === "outer" ? 2 : 1.2) * u
      const a = toImg(line.a)
      const b = toImg(line.b)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  // Current shot context.
  let last = -1
  for (let i = 0; i < result.shots.length; i++) {
    if (result.shots[i].t <= t + 0.02) last = i
    else break
  }
  const lastShot = last >= 0 ? result.shots[last] : null
  const rally = lastShot ? result.rallies[lastShot.rallyIndex] : null
  const inRally = !!rally && t <= rally.end + 1.5

  // Players.
  const slots = session.settings.format === "doubles" ? 2 : 1
  const ti = trackIndexAt(session.track, t)
  const players: { side: Side; slot: number; p: Pt }[] = []
  if (courtToImage && !offCam) {
    for (const side of ["near", "far"] as Side[]) {
      for (let s = 0; s < slots; s++) {
        const p = positionAt(session.track, side, s, t)
        if (!p) continue
        players.push({ side, slot: s, p })
        const c = toImg(p)
        const rx = (side === "near" ? 34 : 20) * u
        const color = SIDE_COLORS[side]
        ctx.lineWidth = 3 * u
        ctx.strokeStyle = color
        ctx.fillStyle = color + "33"
        ctx.beginPath()
        ctx.ellipse(c.x, c.y, rx, rx * 0.38, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        if (opts.labels) {
          const info = session.settings.players[side][s]
          const d = ti >= 0 ? model.cumulative[`${side}${s}`]?.[ti] ?? 0 : 0
          const label = `${info?.name ?? side} · ${d.toFixed(0)} m`
          ctx.font = `600 ${13 * u}px system-ui, sans-serif`
          const tw = ctx.measureText(label).width
          const bx = c.x - tw / 2 - 7 * u
          const by = c.y + rx * 0.38 + 6 * u
          ctx.fillStyle = "rgba(10,14,26,0.78)"
          roundRect(ctx, bx, by, tw + 14 * u, 22 * u, 6 * u)
          ctx.fill()
          ctx.fillStyle = color
          ctx.fillRect(bx, by, 3 * u, 22 * u)
          ctx.fillStyle = "#f9fafb"
          ctx.textBaseline = "middle"
          ctx.fillText(label, bx + 8 * u, by + 11 * u)
        }
      }
    }
  }

  // Flash at the hitter on each shot.
  if (lastShot && lastShot.pos && courtToImage && !offCam) {
    const age = t - lastShot.t
    if (age >= 0 && age < 0.45) {
      const c = toImg(lastShot.pos)
      const k = age / 0.45
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`
      ctx.lineWidth = 4 * u * (1 - k) + 1
      ctx.beginPath()
      ctx.ellipse(c.x, c.y - 40 * u, (24 + 50 * k) * u, (24 + 50 * k) * u, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // HUD: score + rally + last shot.
  const names = (side: Side) =>
    session.settings.players[side].map((p) => p.name).join(" / ") || side
  const score = replay
    ? result.rallies[replay.rallyIndex]?.scoreAfter ?? { near: 0, far: 0 } // TV-style: replays show the updated score
    : rally && t >= rally.end
      ? rally.scoreAfter
      : rally
        ? result.rallies[rally.index - 1]?.scoreAfter ?? { near: 0, far: 0 }
        : { near: 0, far: 0 }
  const pad = 12 * u
  const rowH = 26 * u
  const hudW = 300 * u
  ctx.fillStyle = "rgba(10,14,26,0.8)"
  roundRect(ctx, pad, pad, hudW, rowH * 2 + 34 * u, 10 * u)
  ctx.fill()
  ctx.textBaseline = "middle"
  ;(["far", "near"] as Side[]).forEach((side, i) => {
    const y = pad + 8 * u + rowH * i + rowH / 2
    ctx.fillStyle = SIDE_COLORS[side]
    ctx.fillRect(pad + 10 * u, y - 8 * u, 4 * u, 16 * u)
    ctx.fillStyle = "#f9fafb"
    ctx.font = `600 ${14 * u}px system-ui, sans-serif`
    let n = names(side)
    while (ctx.measureText(n).width > hudW - 90 * u && n.length > 3) n = n.slice(0, -2) + "…"
    ctx.fillText(n, pad + 22 * u, y)
    ctx.font = `700 ${18 * u}px system-ui, sans-serif`
    const sc = String(score[side])
    ctx.fillText(sc, pad + hudW - 16 * u - ctx.measureText(sc).width, y)
  })
  ctx.font = `500 ${12 * u}px system-ui, sans-serif`
  ctx.fillStyle = "#9ca3af"
  const rallyText = rally && inRally
    ? `Rally ${rally.index + 1} · shot ${lastShot!.indexInRally + 1}`
    : `${result.totals.shots} shots · ${result.totals.rallies} rallies`
  ctx.fillText(rallyText, pad + 12 * u, pad + rowH * 2 + 22 * u)

  if (lastShot && t - lastShot.t < 1.6 && inRally) {
    const text = `${SHOT_LABELS[lastShot.type]}${lastShot.speedKmh ? ` · ${lastShot.speedKmh} km/h` : ""}`
    ctx.font = `700 ${20 * u}px system-ui, sans-serif`
    const tw = ctx.measureText(text).width
    const x = W / 2 - tw / 2 - 14 * u
    ctx.fillStyle = "rgba(10,14,26,0.8)"
    roundRect(ctx, x, pad, tw + 28 * u, 38 * u, 10 * u)
    ctx.fill()
    ctx.fillStyle = SIDE_COLORS[lastShot.side]
    ctx.fillRect(x, pad + 34 * u, tw + 28 * u, 4 * u)
    ctx.fillStyle = "#f9fafb"
    ctx.fillText(text, x + 14 * u, pad + 19 * u)
  }

  // Mini court map.
  if (opts.miniMap) {
    const mh = 150 * u
    const mw = (mh * COURT_W) / COURT_L
    const mx = W - mw - pad - 8 * u
    const my = H - mh - pad - 8 * u
    ctx.fillStyle = "rgba(10,14,26,0.8)"
    roundRect(ctx, mx - 8 * u, my - 8 * u, mw + 16 * u, mh + 16 * u, 8 * u)
    ctx.fill()
    const m = (p: Pt) => ({ x: mx + (p.x / COURT_W) * mw, y: my + (p.y / COURT_L) * mh })
    ctx.strokeStyle = "rgba(255,255,255,0.35)"
    ctx.lineWidth = 1
    for (const line of courtLines()) {
      const a = m(line.a), b = m(line.b)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    for (const pl of players) {
      const c = m({ x: Math.max(-0.5, Math.min(COURT_W + 0.5, pl.p.x)), y: Math.max(-0.5, Math.min(COURT_L + 0.5, pl.p.y)) })
      ctx.fillStyle = SIDE_COLORS[pl.side]
      ctx.strokeStyle = "#0a0e1a"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(c.x, c.y, 5 * u, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  if (replay) {
    // Frame the picture and badge it, like a TV replay.
    ctx.strokeStyle = "rgba(239,68,68,0.85)"
    ctx.lineWidth = 6 * u
    ctx.strokeRect(3 * u, 3 * u, W - 6 * u, H - 6 * u)
    const label = `REPLAY · ${SHOT_LABELS[replay.type].toUpperCase()}${replay.speedKmh ? ` · ${replay.speedKmh} KM/H` : ""} · SLOW MOTION`
    ctx.font = `800 ${16 * u}px system-ui, sans-serif`
    ctx.textBaseline = "middle"
    const tw = ctx.measureText(label).width
    const bx = W / 2 - tw / 2 - 16 * u
    const by = H - pad - 44 * u
    ctx.fillStyle = "#dc2626"
    roundRect(ctx, bx, by, tw + 32 * u, 34 * u, 17 * u)
    ctx.fill()
    ctx.fillStyle = "#ffffff"
    ctx.fillText(label, bx + 16 * u, by + 17 * u)
  }

  ctx.font = `700 ${12 * u}px system-ui, sans-serif`
  ctx.fillStyle = "rgba(255,255,255,0.55)"
  ctx.textBaseline = "alphabetic"
  ctx.fillText("SmashLab · Rally Analysis", pad, H - pad)
  ctx.restore()
}
