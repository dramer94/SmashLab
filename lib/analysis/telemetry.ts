import { applyHomography, COURT_L, COURT_W, courtLines, dist } from "./geometry"
import { positionAt, SHOT_LABELS } from "./engine"
import type { Effects } from "./effects"
import type { OverlayModel, OverlayOptions } from "./overlay"
import type { Pt, Shot, ShotType, Side } from "./types"

/**
 * "Telemetry" HUD: a sports-analysis look (player cards with distance, speed
 * and attack/defence bars, a pressure meter, name tags over heads, a shot
 * call-out and a minimap with movement trails). Everything shown comes from
 * the analysis; speeds and shot types are estimates and say so.
 */

const ATTACK: ShotType[] = ["smash", "drop", "net", "drive", "push"]
const DEFENCE: ShotType[] = ["clear", "lift"]
const NEON: Record<Side, string> = { far: "#ff3d9a", near: "#22e1ff" }
const PANEL = "rgba(6,10,22,0.78)"
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

function lowerBound(arr: { t: number }[], t: number) {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].t < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Panel with a cut corner and a neon edge, like a broadcast graphics card. */
function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, edge: string, u: number, lit = false) {
  const c = 10 * u
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w - c, y)
  ctx.lineTo(x + w, y + c)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x + c, y + h)
  ctx.lineTo(x, y + h - c)
  ctx.closePath()
  ctx.fillStyle = PANEL
  ctx.fill()
  ctx.save()
  ctx.strokeStyle = edge
  ctx.lineWidth = (lit ? 2.5 : 1.3) * u
  if (lit) {
    ctx.shadowColor = edge
    ctx.shadowBlur = 12 * u
  }
  ctx.stroke()
  ctx.restore()
}

export function drawTelemetry(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  model: OverlayModel,
  opts: OverlayOptions,
  fx: Effects
) {
  const { session, result, courtToImage } = model
  const u = Math.max(1, W / 960) * fx.size
  const slots = session.settings.format === "doubles" ? 2 : 1
  const offCam = !!session.offCamera?.some((c) => t >= c.start && t <= c.end)
  const name = (side: Side, s: number) => session.settings.players[side][s]?.name || (side === "near" ? `Near ${s + 1}` : `Far ${s + 1}`)
  const team = (side: Side) => session.settings.players[side].map((p) => p.name).join(" / ") || side
  const toImg = (p: Pt) => {
    const q = applyHomography(courtToImage!, p)
    return { x: q.x * W, y: q.y * H }
  }
  /** Image pixels per metre at a court point (largest direction). */
  const pxPerM = (p: Pt) => {
    const a = toImg({ x: p.x - 0.5, y: p.y }), b = toImg({ x: p.x + 0.5, y: p.y })
    const c = toImg({ x: p.x, y: p.y - 0.5 }), d = toImg({ x: p.x, y: p.y + 0.5 })
    return Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(d.x - c.x, d.y - c.y))
  }
  const speedKmh = (side: Side, s: number) => {
    const a = positionAt(session.track, side, s, t - 0.5)
    const b = positionAt(session.track, side, s, t)
    if (!a || !b) return null
    const v = (dist(a, b) / 0.5) * 3.6
    return v > 30 ? null : v
  }
  const ti = (() => {
    let lo = 0, hi = session.track.length - 1
    if (hi < 0) return -1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (session.track[mid].t <= t) lo = mid
      else hi = mid - 1
    }
    return lo
  })()

  // Shots so far: current rally context and running attack/defence shares.
  let last = -1
  for (let i = 0; i < result.shots.length; i++) {
    if (result.shots[i].t <= t + 0.02) last = i
    else break
  }
  const lastShot: Shot | null = last >= 0 ? result.shots[last] : null
  const rally = lastShot ? result.rallies[lastShot.rallyIndex] : null
  const inRally = !!rally && t <= rally.end + 1.5
  const past = result.shots.slice(0, last + 1).filter((s) => s.type !== "serve")
  const shareOf = (side: Side, s: number, types: ShotType[]) => {
    const mine = past.filter((x) => x.side === side && (slots === 1 || x.playerIndex === s))
    return mine.length ? mine.filter((x) => types.includes(x.type)).length / mine.length : 0
  }

  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.textBaseline = "middle"

  // ---- Players on court: ring at the feet, name tag above the head ---------
  const onCourt: { side: Side; s: number; p: Pt }[] = []
  const tags: { x: number; y: number; w: number; footX: number; label: string; color: string }[] = []
  if (courtToImage && !offCam) {
    for (const side of ["far", "near"] as Side[]) {
      for (let s = 0; s < slots; s++) {
        const p = positionAt(session.track, side, s, t)
        if (!p) continue
        onCourt.push({ side, s, p })
        const c = toImg(p)
        const ppm = pxPerM(p)
        const focused = fx.focus?.side === side && fx.focus.slot === s
        const color = NEON[side]
        const rx = Math.max(16 * u, ppm * 0.45)
        ctx.save()
        ctx.shadowColor = color
        ctx.shadowBlur = (focused ? 18 : 8) * u
        ctx.strokeStyle = color
        ctx.lineWidth = (focused ? 3.5 : 2.2) * u
        ctx.fillStyle = color + (focused ? "40" : "22")
        ctx.beginPath()
        ctx.ellipse(c.x, c.y, rx, rx * 0.35, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
        if (opts.labels) {
          const headY = c.y - Math.max(60 * u, ppm * 1.85)
          const label = `${side === "far" ? "F" : "N"}${s + 1} · ${name(side, s).toUpperCase()}`
          ctx.font = `700 ${12 * u}px ${MONO}`
          const w = ctx.measureText(label).width + 16 * u
          tags.push({ x: c.x - w / 2, y: headY - 24 * u, w, footX: c.x, label, color })
        }
      }
    }
    // Lift a tag that would sit on top of another one (partners standing close).
    tags.sort((a, b) => b.y - a.y)
    for (let i = 0; i < tags.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = tags[i], b = tags[j]
        if (a.x < b.x + b.w + 4 * u && b.x < a.x + a.w + 4 * u && Math.abs(a.y - b.y) < 24 * u) a.y = b.y - 26 * u
      }
    }
    for (const g of tags) {
      ctx.font = `700 ${12 * u}px ${MONO}`
      ctx.fillStyle = g.color
      ctx.fillRect(g.x, g.y, g.w, 20 * u)
      ctx.fillStyle = "#04060d"
      ctx.fillText(g.label, g.x + 8 * u, g.y + 10 * u)
      ctx.strokeStyle = g.color
      ctx.lineWidth = 1.2 * u
      ctx.beginPath()
      ctx.moveTo(g.footX, g.y + 20 * u)
      ctx.lineTo(g.footX, g.y + 34 * u)
      ctx.stroke()
    }
  }

  // ---- Shuttle trail ---------------------------------------------------------
  if (opts.shuttle !== false && session.shuttle?.length && !offCam) {
    const pts = session.shuttle
    const seg = pts.slice(lowerBound(pts, t - 0.5), lowerBound(pts, t + 0.001)).filter((p, k, a) => k === 0 || p.t - a[k - 1].t < 0.15)
    if (seg.length && t - seg[seg.length - 1].t < 0.12) {
      for (let k = 1; k < seg.length; k++) {
        const f = k / seg.length
        ctx.strokeStyle = `rgba(56,232,255,${0.15 + 0.8 * f})`
        ctx.lineWidth = (1 + 3 * f) * u
        ctx.beginPath()
        ctx.moveTo(seg[k - 1].x * W, seg[k - 1].y * H)
        ctx.lineTo(seg[k].x * W, seg[k].y * H)
        ctx.stroke()
      }
      for (const q of seg.filter((_, k) => k % 2 === 0)) {
        ctx.fillStyle = "rgba(160,245,255,0.9)"
        ctx.beginPath()
        ctx.arc(q.x * W, q.y * H, 2.5 * u, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // ---- Hit flash ---------------------------------------------------------------
  if (lastShot?.pos && courtToImage && !offCam) {
    const age = t - lastShot.t
    if (age >= 0 && age < 0.5) {
      const c = toImg(lastShot.pos)
      const k = age / 0.5
      const ppm = pxPerM(lastShot.pos)
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`
      ctx.lineWidth = 3 * u * (1 - k) + 1
      ctx.beginPath()
      ctx.arc(c.x, c.y - ppm * 1.1, (20 + 46 * k) * u, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // ---- Landing marker -------------------------------------------------------------
  if (courtToImage && !offCam) {
    for (const r of result.rallies) {
      const l = r.landing
      if (!l || t < l.t || t > l.t + 2.5) continue
      const c = toImg({ x: l.x, y: l.y })
      ctx.strokeStyle = l.in ? "#3dffa2" : "#ff4d5e"
      ctx.lineWidth = 2.5 * u
      for (const k of [1, 0.6]) {
        ctx.beginPath()
        ctx.ellipse(c.x, c.y, 18 * u * k, 7 * u * k, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.font = `800 ${13 * u}px ${MONO}`
      ctx.fillStyle = l.in ? "#3dffa2" : "#ff4d5e"
      const tag = l.in ? "IN" : "OUT"
      ctx.fillText(tag, c.x - ctx.measureText(tag).width / 2, c.y - 18 * u)
    }
  }

  const pad = 14 * u

  // ---- Scorebug, top left ---------------------------------------------------------
  const score = rally && t >= rally.end ? rally.scoreAfter : rally ? result.rallies[rally.index - 1]?.scoreAfter ?? { near: 0, far: 0 } : { near: 0, far: 0 }
  const sbW = 250 * u, rowH = 26 * u
  ;(["far", "near"] as Side[]).forEach((side, i) => {
    const y = pad + i * (rowH + 3 * u)
    ctx.fillStyle = "rgba(240,244,255,0.92)"
    ctx.fillRect(pad, y, sbW, rowH)
    ctx.fillStyle = NEON[side]
    ctx.fillRect(pad, y, 6 * u, rowH)
    ctx.fillStyle = "#10162a"
    ctx.fillRect(pad + sbW, y, 34 * u, rowH)
    ctx.font = `700 ${13 * u}px ${MONO}`
    let n = team(side).toUpperCase()
    while (ctx.measureText(n).width > sbW - 24 * u && n.length > 3) n = n.slice(0, -2) + "…"
    ctx.fillStyle = "#0b1020"
    ctx.fillText(n, pad + 14 * u, y + rowH / 2)
    ctx.font = `800 ${16 * u}px ${MONO}`
    const sc = String(score[side])
    ctx.fillStyle = "#ffffff"
    ctx.fillText(sc, pad + sbW + 17 * u - ctx.measureText(sc).width / 2, y + rowH / 2)
  })
  ctx.font = `600 ${11 * u}px ${MONO}`
  ctx.fillStyle = "#3dffa2"
  ctx.fillText(inRally && rally ? `● LIVE · RALLY ${rally.index + 1} · SHOT ${lastShot!.indexInRally + 1}` : "● BETWEEN RALLIES", pad, pad + 2 * (rowH + 3 * u) + 10 * u)

  // ---- Player cards, left column --------------------------------------------------
  const cw = 196 * u, ch = 70 * u
  let cy = pad + 2 * (rowH + 3 * u) + 26 * u
  for (const side of ["far", "near"] as Side[]) {
    for (let s = 0; s < slots; s++) {
      if (cy + ch > H - 120 * u) break
      const focused = fx.focus?.side === side && fx.focus.slot === s
      card(ctx, pad, cy, cw, ch, NEON[side], u, focused)
      ctx.font = `700 ${13 * u}px ${MONO}`
      ctx.fillStyle = NEON[side]
      ctx.fillText(`${side === "far" ? "F" : "N"}${s + 1} – ${name(side, s).toUpperCase()}`, pad + 10 * u, cy + 14 * u)
      const d = ti >= 0 ? model.cumulative[`${side}${s}`]?.[ti] ?? 0 : 0
      const v = speedKmh(side, s)
      ctx.font = `500 ${10 * u}px ${MONO}`
      ctx.fillStyle = "#8b96b8"
      ctx.fillText("DISTANCE", pad + 10 * u, cy + 34 * u)
      ctx.fillText("SPEED", pad + 10 * u, cy + 54 * u)
      ctx.font = `700 ${15 * u}px ${MONO}`
      ctx.fillStyle = "#f2f6ff"
      ctx.fillText(`${d.toFixed(1)} m`, pad + 78 * u, cy + 34 * u)
      ctx.fillText(v == null ? "–" : `${v.toFixed(1)} km/h`, pad + 78 * u, cy + 54 * u)
      // Attack / defence bars: share of this player's shots so far.
      const bars: [string, number, string][] = [["A", shareOf(side, s, ATTACK), "#ffb020"], ["D", shareOf(side, s, DEFENCE), "#3dffa2"]]
      bars.forEach(([lab, f, col], k) => {
        const bx = pad + cw - 34 * u + k * 14 * u, by = cy + 22 * u, bh = 38 * u
        ctx.fillStyle = "rgba(255,255,255,0.12)"
        ctx.fillRect(bx, by, 8 * u, bh)
        ctx.fillStyle = col
        ctx.fillRect(bx, by + bh * (1 - f), 8 * u, bh * f)
        ctx.font = `600 ${8 * u}px ${MONO}`
        ctx.fillStyle = "#8b96b8"
        ctx.fillText(lab, bx + 1 * u, by - 6 * u)
      })
      cy += ch + 8 * u
    }
  }

  // ---- Pressure meter, top centre: attacking shots in the last 6 of this rally ---
  {
    const left = pad + sbW + 34 * u + 90 * u
    const right = W - pad - 80 * u
    const mw = Math.max(120 * u, Math.min(460 * u, right - left)), mh = 16 * u
    const mx = left + (right - left - mw) / 2, my = pad + 14 * u
    const recent = inRally && rally ? rally.shots.filter((x) => x.t <= t + 0.02 && x.type !== "serve").slice(-6) : []
    const att = (side: Side) => recent.filter((x) => x.side === side && ATTACK.includes(x.type)).length
    const a = att("far"), b = att("near")
    const f = a + b ? a / (a + b) : 0.5
    card(ctx, mx - 70 * u, my - 12 * u, mw + 140 * u, mh + 34 * u, "rgba(140,160,255,0.45)", u)
    const grad = ctx.createLinearGradient(mx, 0, mx + mw, 0)
    grad.addColorStop(0, NEON.far)
    grad.addColorStop(1, NEON.near)
    ctx.fillStyle = "rgba(255,255,255,0.1)"
    ctx.fillRect(mx, my, mw, mh)
    ctx.fillStyle = grad
    ctx.globalAlpha = 0.85
    ctx.fillRect(mx, my, mw, mh)
    ctx.globalAlpha = 1
    const split = mx + mw * f
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(split - 2 * u, my - 4 * u, 4 * u, mh + 8 * u)
    ctx.font = `700 ${11 * u}px ${MONO}`
    ctx.fillStyle = NEON.far
    ctx.fillText(`${Math.round(f * 100)}%`, mx - 60 * u, my + mh / 2)
    ctx.fillStyle = NEON.near
    const rp = `${Math.round((1 - f) * 100)}%`
    ctx.fillText(rp, mx + mw + 60 * u - ctx.measureText(rp).width, my + mh / 2)
    const verdict = !recent.length ? "PRESSURE METER" : Math.abs(f - 0.5) < 0.17 ? "NEUTRAL" : `${(f > 0.5 ? team("far") : team("near")).toUpperCase()} ATTACKING`
    ctx.font = `600 ${10 * u}px ${MONO}`
    ctx.fillStyle = "#c9d3f2"
    ctx.fillText(verdict, mx + mw / 2 - ctx.measureText(verdict).width / 2, my + mh + 12 * u)
  }

  // ---- Shot call-out, bottom left --------------------------------------------------
  if (lastShot && inRally && t - lastShot.t < 1.8) {
    const bw = 250 * u, bh = 62 * u, bx = pad, by = H - pad - bh
    card(ctx, bx, by, bw, bh, NEON[lastShot.side], u, t - lastShot.t < 0.4)
    ctx.font = `600 ${9 * u}px ${MONO}`
    ctx.fillStyle = "#8b96b8"
    ctx.fillText("SHOT DETECTED", bx + 12 * u, by + 13 * u)
    ctx.font = `800 ${22 * u}px ${MONO}`
    ctx.fillStyle = "#ffffff"
    ctx.fillText(SHOT_LABELS[lastShot.type].toUpperCase(), bx + 12 * u, by + 34 * u)
    ctx.font = `600 ${11 * u}px ${MONO}`
    ctx.fillStyle = NEON[lastShot.side]
    const who = `${name(lastShot.side, lastShot.playerIndex).toUpperCase()}${lastShot.speedKmh && lastShot.speedKmh <= 260 ? ` · ~${lastShot.speedKmh} KM/H` : ""}`
    ctx.fillText(who, bx + 12 * u, by + 52 * u)
  }

  // ---- Minimap with 3-second trails, bottom right --------------------------------
  if (opts.miniMap) {
    const mh = 190 * u
    const mw = (mh * COURT_W) / COURT_L
    const mx = W - mw - pad - 10 * u
    const my = H - mh - pad - 10 * u
    card(ctx, mx - 10 * u, my - 22 * u, mw + 20 * u, mh + 32 * u, "rgba(61,255,162,0.6)", u)
    ctx.font = `600 ${9 * u}px ${MONO}`
    ctx.fillStyle = "#3dffa2"
    ctx.fillText("COURT MAP", mx, my - 12 * u)
    const m = (p: Pt) => ({ x: mx + (Math.max(-0.5, Math.min(COURT_W + 0.5, p.x)) / COURT_W) * mw, y: my + (Math.max(-0.5, Math.min(COURT_L + 0.5, p.y)) / COURT_L) * mh })
    ctx.strokeStyle = "rgba(61,255,162,0.45)"
    ctx.lineWidth = 1
    for (const line of courtLines()) {
      const a = m(line.a), b = m(line.b)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    for (const side of ["far", "near"] as Side[]) {
      for (let s = 0; s < slots; s++) {
        for (let k = 30; k >= 1; k--) {
          const p = positionAt(session.track, side, s, t - k * 0.1)
          if (!p) continue
          const c = m(p)
          ctx.fillStyle = NEON[side] + Math.round((1 - k / 30) * 120).toString(16).padStart(2, "0")
          ctx.beginPath()
          ctx.arc(c.x, c.y, 2.5 * u, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    for (const pl of onCourt) {
      const c = m(pl.p)
      ctx.fillStyle = NEON[pl.side]
      ctx.beginPath()
      ctx.arc(c.x, c.y, 5 * u, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = `700 ${8 * u}px ${MONO}`
      ctx.fillStyle = "#ffffff"
      ctx.fillText(`${pl.side === "far" ? "F" : "N"}${pl.s + 1}`, c.x + 7 * u, c.y)
    }
  }

  // ---- Honesty tag, top right -----------------------------------------------------
  ctx.font = `600 ${10 * u}px ${MONO}`
  const tag = "SMASHLAB · AI ESTIMATES"
  ctx.fillStyle = "rgba(220,230,255,0.7)"
  ctx.fillText(tag, W / 2 - ctx.measureText(tag).width / 2, H - pad)
  ctx.restore()
}
