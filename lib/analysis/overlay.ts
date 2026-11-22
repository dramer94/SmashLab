import { applyHomography, computeHomography, COURT_L, COURT_W, courtLines, dist, markPoints, type Homography } from "./geometry"
import { positionAt, SHOT_LABELS } from "./engine"
import { DEFAULT_EFFECTS, THEMES, type Effects, type View } from "./effects"
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
  shuttle?: boolean
}

function lowerBound(arr: { t: number }[], t: number) {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].t < t) lo = mid + 1
    else hi = mid
  }
  return lo
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

export interface OverlayExtras {
  /** Shot being replayed in slow motion, if any. */
  replay?: Shot | null
  effects?: Effects
  brand?: { text: string; logo: CanvasImageSource | null }
  /** Zoom window (focus on one player); world markers follow it, the HUD does not. */
  view?: View | null
}

/** Draws the analysis overlay for video time `t` onto a canvas of size W×H. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  model: OverlayModel,
  opts: OverlayOptions,
  extras: OverlayExtras = {}
) {
  const { session, result, courtToImage } = model
  const fx = extras.effects ?? DEFAULT_EFFECTS
  const theme = THEMES[fx.theme]
  const colors = fx.colors
  const replay = extras.replay ?? null
  const view = extras.view ?? null
  const zoom = view ? W / view.sw : 1
  const toImg = (p: Pt) => {
    const q = applyHomography(courtToImage!, p)
    let x = q.x * W
    let y = q.y * H
    if (view) {
      x = (x - view.sx) * zoom
      y = (y - view.sy) * zoom
    }
    return { x, y }
  }
  const u = Math.max(1, W / 960) * fx.size // scale unit so the HUD looks the same at any size
  const panel = (a = 1) => `rgba(${theme.panel},${Math.max(0, Math.min(1, fx.opacity * a))})`
  const caps = (x: string) => (theme.upper ? x.toUpperCase() : x)
  const offCam = !!session.offCamera?.some((c) => t >= c.start && t <= c.end)
  const fillPanel = (x: number, y: number, w: number, h: number, r = theme.radius) => {
    if (theme.layout === "bare") return
    ctx.fillStyle = panel()
    roundRect(ctx, x, y, w, h, r * u)
    ctx.fill()
    if (theme.glow) {
      ctx.save()
      ctx.shadowColor = theme.glow
      ctx.shadowBlur = 10 * u
      ctx.strokeStyle = theme.glow
      ctx.lineWidth = 1.5 * u
      ctx.stroke()
      ctx.restore()
    }
  }
  const text = (str: string, x: number, y: number, color = theme.text) => {
    if (theme.layout === "bare") {
      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.85)"
      ctx.shadowBlur = 6 * u
      ctx.fillStyle = color
      ctx.fillText(str, x, y)
      ctx.restore()
    } else {
      ctx.fillStyle = color
      ctx.fillText(str, x, y)
    }
  }
  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  if (courtToImage && opts.courtLines && !offCam) {
    ctx.strokeStyle = "rgba(250, 204, 21, 0.55)"
    for (const line of courtLines()) {
      ctx.lineWidth = (line.kind === "outer" ? 2 : 1.2) * u * zoom
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
        const focused = fx.focus?.side === side && fx.focus.slot === s
        if (fx.focus && !focused && view) continue // in focus mode only the focused player is marked
        const c = toImg(p)
        const rx = (side === "near" ? 34 : 20) * u * zoom * 0.8 + 6 * u
        const color = colors[side]
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
          const label = caps(`${info?.name ?? side} · ${d.toFixed(0)} m`)
          ctx.font = `600 ${13 * u}px system-ui, sans-serif`
          const tw = ctx.measureText(label).width
          const bx = c.x - tw / 2 - 7 * u
          const by = c.y + rx * 0.38 + 6 * u
          fillPanel(bx, by, tw + 14 * u, 22 * u, Math.min(theme.radius, 6))
          ctx.fillStyle = color
          ctx.fillRect(bx, by, 3 * u, 22 * u)
          ctx.textBaseline = "middle"
          text(label, bx + 8 * u, by + 11 * u)
        }
      }
    }
  }

  // Shuttle trail: the last 0.35 s of seen positions, fading out behind the head.
  if (opts.shuttle !== false && session.shuttle?.length && !offCam) {
    const pts = session.shuttle
    const i1 = lowerBound(pts, t + 0.001)
    const i0 = lowerBound(pts, t - 0.35)
    const seg = pts.slice(i0, i1).filter((p, k, a) => k === 0 || p.t - a[k - 1].t < 0.15)
    if (seg.length && t - seg[seg.length - 1].t < 0.12) {
      const at = (p: { x: number; y: number }) => {
        let x = p.x * W, y = p.y * H
        if (view) { x = (x - view.sx) * zoom; y = (y - view.sy) * zoom }
        return { x, y }
      }
      for (let k = 1; k < seg.length; k++) {
        const a = at(seg[k - 1]), b = at(seg[k])
        const f = k / seg.length
        ctx.strokeStyle = `rgba(250,204,21,${0.15 + 0.75 * f})`
        ctx.lineWidth = (1.5 + 3.5 * f) * u
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      const head = at(seg[seg.length - 1])
      ctx.fillStyle = "#fef08a"
      ctx.strokeStyle = "rgba(0,0,0,0.6)"
      ctx.lineWidth = 1.5 * u
      ctx.beginPath()
      ctx.arc(head.x, head.y, 4 * u, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  // Where the last shot of the rally came down, shown for 2.5 s.
  if (courtToImage && !offCam) {
    for (const r of result.rallies) {
      const l = r.landing
      if (!l || t < l.t || t > l.t + 2.5) continue
      const c = toImg({ x: l.x, y: l.y })
      const s = 10 * u * Math.sqrt(zoom)
      ctx.strokeStyle = l.in ? "#22c55e" : "#ef4444"
      ctx.lineWidth = 3 * u
      ctx.beginPath()
      ctx.ellipse(c.x, c.y, s * 1.6, s * 0.6, 0, 0, Math.PI * 2)
      ctx.stroke()
      const tag = `${l.in ? "IN" : "OUT"}${l.close ? " · CLOSE" : ""}`
      ctx.font = `800 ${14 * u}px system-ui, sans-serif`
      ctx.textBaseline = "middle"
      const tw = ctx.measureText(tag).width
      ctx.fillStyle = l.in ? "#16a34a" : "#dc2626"
      roundRect(ctx, c.x - tw / 2 - 8 * u, c.y - s - 30 * u, tw + 16 * u, 22 * u, 11 * u)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.fillText(tag, c.x - tw / 2, c.y - s - 19 * u)
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
      const r = (24 + 50 * k) * u * Math.sqrt(zoom)
      ctx.ellipse(c.x, c.y - 40 * u * zoom, r, r, 0, 0, Math.PI * 2)
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
  const rallyText = rally && inRally
    ? `Rally ${rally.index + 1} · shot ${lastShot!.indexInRally + 1}`
    : `${result.totals.shots} shots · ${result.totals.rallies} rallies`
  ctx.textBaseline = "middle"
  if (theme.layout === "bar") {
    // TV scorebug: square rows, score in a team-coloured box.
    const nameW = 210 * u
    const boxW = 40 * u
    ;(["far", "near"] as Side[]).forEach((side, i) => {
      const y = pad + i * (rowH + 2 * u)
      ctx.fillStyle = panel()
      ctx.fillRect(pad, y, nameW, rowH)
      ctx.fillStyle = colors[side]
      ctx.fillRect(pad, y, 5 * u, rowH)
      ctx.fillRect(pad + nameW, y, boxW, rowH)
      ctx.font = `700 ${13 * u}px system-ui, sans-serif`
      let n = caps(names(side))
      while (ctx.measureText(n).width > nameW - 24 * u && n.length > 3) n = n.slice(0, -2) + "…"
      text(n, pad + 14 * u, y + rowH / 2)
      ctx.font = `800 ${17 * u}px system-ui, sans-serif`
      const sc = String(score[side])
      ctx.fillStyle = "#ffffff"
      ctx.fillText(sc, pad + nameW + boxW / 2 - ctx.measureText(sc).width / 2, y + rowH / 2)
    })
    const y = pad + 2 * (rowH + 2 * u)
    ctx.font = `600 ${11 * u}px system-ui, sans-serif`
    const rt = caps(rallyText)
    ctx.fillStyle = panel(0.85)
    ctx.fillRect(pad, y, ctx.measureText(rt).width + 20 * u, 20 * u)
    text(rt, pad + 10 * u, y + 10 * u, theme.muted)
  } else if (theme.layout === "bare") {
    ctx.font = `800 ${22 * u}px system-ui, sans-serif`
    const line = `${score.far}`
    text(line, pad, pad + 14 * u, colors.far)
    const w1 = ctx.measureText(line).width
    text("–", pad + w1 + 8 * u, pad + 14 * u)
    text(`${score.near}`, pad + w1 + 26 * u, pad + 14 * u, colors.near)
    ctx.font = `600 ${12 * u}px system-ui, sans-serif`
    text(caps(rallyText), pad, pad + 38 * u, theme.muted)
  } else {
    const hudW = 300 * u
    fillPanel(pad, pad, hudW, rowH * 2 + 34 * u)
    ;(["far", "near"] as Side[]).forEach((side, i) => {
      const y = pad + 8 * u + rowH * i + rowH / 2
      ctx.fillStyle = colors[side]
      ctx.fillRect(pad + 10 * u, y - 8 * u, 4 * u, 16 * u)
      ctx.font = `600 ${14 * u}px system-ui, sans-serif`
      let n = caps(names(side))
      while (ctx.measureText(n).width > hudW - 90 * u && n.length > 3) n = n.slice(0, -2) + "…"
      text(n, pad + 22 * u, y)
      ctx.font = `700 ${18 * u}px system-ui, sans-serif`
      const sc = String(score[side])
      text(sc, pad + hudW - 16 * u - ctx.measureText(sc).width, y)
    })
    ctx.font = `500 ${12 * u}px system-ui, sans-serif`
    text(caps(rallyText), pad + 12 * u, pad + rowH * 2 + 22 * u, theme.muted)
  }

  if (lastShot && t - lastShot.t < 1.6 && inRally) {
    const label = caps(`${SHOT_LABELS[lastShot.type]}${lastShot.speedKmh ? ` · ${lastShot.speedKmh} km/h` : ""}`)
    ctx.font = `700 ${20 * u}px system-ui, sans-serif`
    const tw = ctx.measureText(label).width
    const x = W / 2 - tw / 2 - 14 * u
    fillPanel(x, pad, tw + 28 * u, 38 * u)
    ctx.fillStyle = colors[lastShot.side]
    ctx.fillRect(x, pad + 34 * u, tw + 28 * u, 4 * u)
    text(label, x + 14 * u, pad + 19 * u)
  }

  // Brand: logo and/or club text, top right.
  const brand = fx.showBrand ? extras.brand : undefined
  if (brand && (brand.logo || brand.text)) {
    const lh = 44 * u
    let x = W - pad
    ctx.font = `700 ${15 * u}px system-ui, sans-serif`
    const tw = brand.text ? ctx.measureText(caps(brand.text)).width : 0
    const img = brand.logo as HTMLImageElement | null
    const lw = img ? (img.width && img.height ? (lh * img.width) / img.height : lh) : 0
    const boxW = lw + (tw ? tw + 20 * u : 0) + (lw ? 12 * u : 0)
    fillPanel(x - boxW, pad, boxW, lh + 8 * u)
    if (img) {
      ctx.drawImage(img, x - boxW + 6 * u, pad + 4 * u, lw, lh)
    }
    if (tw) text(caps(brand.text), x - tw - 10 * u, pad + 4 * u + lh / 2)
    x -= boxW
  }

  // Mini court map.
  if (opts.miniMap) {
    const mh = 150 * u
    const mw = (mh * COURT_W) / COURT_L
    const mx = W - mw - pad - 8 * u
    const my = H - mh - pad - 8 * u
    ctx.fillStyle = `rgba(${theme.panel === "250,250,250" ? "10,14,26" : theme.panel},${Math.max(0.55, fx.opacity)})`
    roundRect(ctx, mx - 8 * u, my - 8 * u, mw + 16 * u, mh + 16 * u, Math.min(theme.radius, 8) * u)
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
      ctx.fillStyle = colors[pl.side]
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

  if (fx.watermark) {
    ctx.font = `700 ${12 * u}px system-ui, sans-serif`
    ctx.fillStyle = "rgba(255,255,255,0.55)"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("SmashLab · Rally Analysis", pad, H - pad)
  }
  ctx.restore()
}
