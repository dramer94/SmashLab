import { positionAt, SHOT_LABELS } from "./engine"
import type { AnalysisResult, Pt, Session, Shot, Side } from "./types"

/** Look of the recorded video. Saved with each analysis. */
export interface Effects {
  theme: HudTheme
  colors: Record<Side, string>
  /** HUD panel opacity, 0.2–1. */
  opacity: number
  /** HUD scale, 0.7–1.5. */
  size: number
  /** Show the user's text / logo (saved once per browser, see Brand). */
  showBrand: boolean
  watermark: boolean
  endCard: boolean
  /** Zoom the picture onto one player and follow them. */
  focus: { side: Side; slot: number } | null
  focusZoom: number
  hitSound: boolean
  crowdSound: boolean
  /** Pick the best shots for slow-motion replays automatically. */
  autoReplay: boolean
}

/** The user's club text and logo, reused across analyses. */
export interface Brand {
  text: string
  /** Small PNG data URL. */
  logo: string | null
}

export const HUD_THEMES = ["classic", "broadcast", "minimal", "light", "neon", "club", "telemetry"] as const
export type HudTheme = (typeof HUD_THEMES)[number]

export interface ThemeStyle {
  label: string
  panel: string
  text: string
  muted: string
  radius: number
  layout: "stack" | "bar" | "bare"
  upper: boolean
  glow: string | null
}

export const THEMES: Record<HudTheme, ThemeStyle> = {
  classic: { label: "Classic", panel: "10,14,26", text: "#f9fafb", muted: "#9ca3af", radius: 10, layout: "stack", upper: false, glow: null },
  broadcast: { label: "Broadcast", panel: "12,16,32", text: "#ffffff", muted: "#cbd5e1", radius: 2, layout: "bar", upper: true, glow: null },
  minimal: { label: "Minimal", panel: "0,0,0", text: "#ffffff", muted: "#e5e7eb", radius: 6, layout: "bare", upper: false, glow: null },
  light: { label: "Light", panel: "250,250,250", text: "#0b0b0b", muted: "#52514e", radius: 10, layout: "stack", upper: false, glow: null },
  neon: { label: "Neon", panel: "5,5,12", text: "#e0fbff", muted: "#67e8f9", radius: 12, layout: "stack", upper: true, glow: "#22d3ee" },
  club: { label: "Club", panel: "20,20,20", text: "#ffffff", muted: "#d1d5db", radius: 0, layout: "bar", upper: true, glow: null },
  telemetry: { label: "Telemetry", panel: "6,10,22", text: "#f2f6ff", muted: "#8b96b8", radius: 0, layout: "stack", upper: true, glow: "#22e1ff" },
}

export const DEFAULT_EFFECTS: Effects = {
  theme: "classic",
  colors: { near: "#3987e5", far: "#d95926" },
  opacity: 0.8,
  size: 1,
  showBrand: true,
  watermark: true,
  endCard: true,
  focus: null,
  focusZoom: 1.8,
  hitSound: false,
  crowdSound: false,
  autoReplay: true,
}

export function withDefaults(e?: Partial<Effects>): Effects {
  return { ...DEFAULT_EFFECTS, ...e, colors: { ...DEFAULT_EFFECTS.colors, ...e?.colors } }
}

const BRAND_KEY = "smashlab.analysis.brand"

export function loadBrand(): Brand {
  try {
    const b = JSON.parse(localStorage.getItem(BRAND_KEY) || "null") as Brand | null
    return { text: b?.text ?? "", logo: b?.logo ?? null }
  } catch {
    return { text: "", logo: null }
  }
}

export function saveBrand(b: Brand) {
  try {
    localStorage.setItem(BRAND_KEY, JSON.stringify(b))
  } catch {
    /* storage full or blocked: the brand just isn't remembered */
  }
}

/** Shrinks an uploaded logo to at most 256 px so it fits in local storage. */
export function logoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, 256 / Math.max(img.width, img.height))
      const c = document.createElement("canvas")
      c.width = Math.max(1, Math.round(img.width * k))
      c.height = Math.max(1, Math.round(img.height * k))
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL("image/png"))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That file is not an image."))
    }
    img.src = url
  })
}

/** Shots that get a slow-motion replay: the user's choices, else the automatic picks. */
export function replayIds(result: AnalysisResult, session: Session, effects: Effects): { ids: Set<string>; auto: Set<string> } {
  const auto = new Set<string>()
  if (effects.autoReplay) {
    // Best shot of each rally (smashes first, then speed); keep the top three.
    const score = (s: Shot) => (s.type === "smash" ? 1000 : 0) + (s.speedKmh ?? 0)
    const best = new Map<number, Shot>()
    for (const s of result.shots) {
      if (s.speedKmh == null || result.rallies[s.rallyIndex].shots.length < 3) continue
      const cur = best.get(s.rallyIndex)
      if (!cur || score(s) > score(cur)) best.set(s.rallyIndex, s)
    }
    ;[...best.values()].sort((a, b) => score(b) - score(a)).slice(0, 3).forEach((s) => auto.add(s.id))
  }
  const ids = new Set<string>()
  for (const s of result.shots) {
    const chosen = session.edits[s.id]?.replay
    if (chosen === true || (chosen === undefined && auto.has(s.id))) ids.add(s.id)
  }
  return { ids, auto }
}

export interface View {
  /** Source rectangle in video pixels that fills the output. */
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * The zoomed window that follows the focused player, smoothed over ±0.6 s so
 * the picture glides instead of shaking. Null when focus is off or the player
 * is not tracked at this moment.
 */
export function focusView(
  session: Session,
  effects: Effects,
  courtToImage: number[] | null,
  t: number,
  W: number,
  H: number
): View | null {
  if (!effects.focus || !courtToImage) return null
  const { side, slot } = effects.focus
  let sx = 0, sy = 0, n = 0
  for (let k = -6; k <= 6; k++) {
    const p = positionAt(session.track, side, slot, t + k * 0.1)
    if (!p) continue
    const q = project(courtToImage, p)
    const w = 1 - Math.abs(k) / 7
    sx += q.x * w
    sy += q.y * w
    n += w
  }
  if (!n) return null
  const z = Math.max(1.1, Math.min(3, effects.focusZoom))
  const sw = W / z
  const sh = H / z
  // Feet sit a bit below centre so the whole body is in the window.
  const cx = (sx / n) * W
  const cy = (sy / n) * H - sh * 0.18
  return {
    sx: Math.max(0, Math.min(W - sw, cx - sw / 2)),
    sy: Math.max(0, Math.min(H - sh, cy - sh / 2)),
    sw,
    sh,
  }
}

function project(H: number[], p: Pt) {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

export interface Title {
  title: string
  name: string
  side: Side
  value: string
}

/** End-card awards. */
export function playerTitles(result: AnalysisResult, session: Session): Title[] {
  const name = (side: Side, slot: number) => session.settings.players[side][slot]?.name ?? side
  const titles: Title[] = []
  const { near, far } = result.sides
  const winner: Side | null = near.ralliesWon === far.ralliesWon ? null : near.ralliesWon > far.ralliesWon ? "near" : "far"
  if (winner) {
    const mates = result.players.filter((p) => p.side === winner)
    const mvp = mates.reduce((a, b) => (b.shots > a.shots ? b : a), mates[0])
    if (mvp) titles.push({ title: "MVP", name: mvp.name, side: winner, value: `${result.sides[winner].ralliesWon} points won` })
  }
  const smash = result.shots.filter((s) => s.type === "smash" && s.speedKmh).sort((a, b) => b.speedKmh! - a.speedKmh!)[0]
  if (smash) titles.push({ title: "Smash king", name: name(smash.side, smash.playerIndex), side: smash.side, value: `${smash.speedKmh} km/h` })
  const runner = [...result.players].sort((a, b) => b.distanceM - a.distanceM)[0]
  if (runner && runner.distanceM > 0) titles.push({ title: "Court runner", name: runner.name, side: runner.side, value: `${runner.distanceM.toFixed(0)} m covered` })
  const busiest = [...result.players].sort((a, b) => b.shots - a.shots)[0]
  if (busiest && busiest.shots > 0 && session.settings.format === "doubles") {
    titles.push({ title: "Most shots", name: busiest.name, side: busiest.side, value: `${busiest.shots} shots` })
  }
  return titles
}

export const END_CARD_S = 5

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** The closing summary card. `k` runs 0→1 over its few seconds (for the fade-in). */
export function drawEndCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  k: number,
  result: AnalysisResult,
  session: Session,
  effects: Effects,
  brand: { text: string; logo: CanvasImageSource | null }
) {
  const u = Math.max(1, W / 960)
  const a = Math.min(1, k * 4)
  ctx.save()
  ctx.globalAlpha = a
  ctx.fillStyle = "rgba(6,9,18,0.88)"
  ctx.fillRect(0, 0, W, H)
  const names = (side: Side) => session.settings.players[side].map((p) => p.name).join(" / ")
  const cx = W / 2
  let y = H * 0.12 + (1 - a) * 20 * u
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#9ca3af"
  ctx.font = `700 ${14 * u}px system-ui, sans-serif`
  ctx.fillText((brand.text || "MATCH SUMMARY").toUpperCase(), cx, y)
  y += 46 * u
  // Score line.
  ctx.font = `800 ${44 * u}px system-ui, sans-serif`
  ctx.fillStyle = "#ffffff"
  ctx.fillText(`${result.sides.near.ralliesWon}  –  ${result.sides.far.ralliesWon}`, cx, y)
  ctx.font = `600 ${16 * u}px system-ui, sans-serif`
  ctx.textAlign = "right"
  ctx.fillStyle = effects.colors.near
  ctx.fillText(names("near"), cx - 110 * u, y)
  ctx.textAlign = "left"
  ctx.fillStyle = effects.colors.far
  ctx.fillText(names("far"), cx + 110 * u, y)
  ctx.textAlign = "center"
  y += 50 * u
  // Key numbers.
  const t = result.totals
  const stats = [
    [String(t.shots), "shots"],
    [String(t.rallies), "rallies"],
    [`${t.longestRallyShots}`, "longest rally"],
    [t.fastest?.speedKmh ? `${t.fastest.speedKmh}` : "–", "fastest km/h"],
  ]
  const colW = Math.min(170 * u, (W * 0.8) / stats.length)
  stats.forEach(([v, l], i) => {
    const x = cx + (i - (stats.length - 1) / 2) * colW
    ctx.fillStyle = "#ffffff"
    ctx.font = `800 ${30 * u}px system-ui, sans-serif`
    ctx.fillText(v, x, y)
    ctx.fillStyle = "#9ca3af"
    ctx.font = `500 ${12 * u}px system-ui, sans-serif`
    ctx.fillText(l.toUpperCase(), x, y + 26 * u)
  })
  y += 74 * u
  // Awards, popping in one after another.
  const titles = playerTitles(result, session)
  const cardW = Math.min(200 * u, (W * 0.9) / Math.max(1, titles.length))
  titles.forEach((tt, i) => {
    const appear = Math.max(0, Math.min(1, (k * END_CARD_S - 0.8 - i * 0.45) / 0.35))
    if (!appear) return
    const x = cx + (i - (titles.length - 1) / 2) * (cardW + 10 * u) - cardW / 2
    const h = 86 * u
    ctx.globalAlpha = a * appear
    ctx.fillStyle = "rgba(255,255,255,0.06)"
    rr(ctx, x, y, cardW, h, 10 * u)
    ctx.fill()
    ctx.fillStyle = effects.colors[tt.side]
    ctx.fillRect(x, y, cardW, 4 * u)
    ctx.fillStyle = "#facc15"
    ctx.font = `800 ${12 * u}px system-ui, sans-serif`
    ctx.fillText(tt.title.toUpperCase(), x + cardW / 2, y + 22 * u)
    ctx.fillStyle = "#ffffff"
    ctx.font = `700 ${16 * u}px system-ui, sans-serif`
    let n = tt.name
    while (ctx.measureText(n).width > cardW - 16 * u && n.length > 3) n = n.slice(0, -2) + "…"
    ctx.fillText(n, x + cardW / 2, y + 46 * u)
    ctx.fillStyle = "#9ca3af"
    ctx.font = `500 ${12 * u}px system-ui, sans-serif`
    ctx.fillText(tt.value, x + cardW / 2, y + 68 * u)
  })
  ctx.globalAlpha = a
  // Footer: logo + SmashLab.
  if (brand.logo) {
    const lh = 40 * u
    const img = brand.logo as HTMLImageElement
    const lw = img.width && img.height ? (lh * img.width) / img.height : lh
    ctx.drawImage(brand.logo, cx - lw / 2, H - 92 * u, lw, lh)
  }
  ctx.fillStyle = "rgba(255,255,255,0.6)"
  ctx.font = `700 ${13 * u}px system-ui, sans-serif`
  ctx.fillText("Analysed with SmashLab · smashlab.vacabc.my", cx, H - 32 * u)
  ctx.restore()
}

/* ------------------------------ Sound effects ------------------------------ */

/** Synthesised racket "thwack": a bright noise burst with a short tonal knock. */
export function playHit(ctx: BaseAudioContext, out: AudioNode, strength = 1) {
  const now = ctx.currentTime
  const len = Math.floor(ctx.sampleRate * 0.08)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.012))
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = "bandpass"
  bp.frequency.value = 3200
  bp.Q.value = 0.9
  const g = ctx.createGain()
  g.gain.value = 0.32 * strength
  noise.connect(bp).connect(g).connect(out)
  noise.start(now)
  const osc = ctx.createOscillator()
  osc.frequency.setValueAtTime(1100, now)
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.05)
  const og = ctx.createGain()
  og.gain.setValueAtTime(0.15 * strength, now)
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
  osc.connect(og).connect(out)
  osc.start(now)
  osc.stop(now + 0.08)
}

/** Synthesised crowd reaction: a swell of filtered noise with scattered claps. */
export function playCrowd(ctx: BaseAudioContext, out: AudioNode, intensity = 1) {
  const now = ctx.currentTime
  const dur = 2.6
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let b0 = 0, b1 = 0
    for (let i = 0; i < len; i++) {
      // Soft "roar": low-passed noise.
      const w = Math.random() * 2 - 1
      b0 = 0.97 * b0 + 0.03 * w
      b1 = 0.6 * b1 + 0.4 * w
      d[i] = b0 * 1.8 + b1 * 0.12
    }
    // Claps: short bright bursts at random times, thinning out.
    const claps = Math.floor(60 * intensity)
    for (let k = 0; k < claps; k++) {
      const at = Math.floor(Math.pow(Math.random(), 1.6) * (len - 2000))
      const amp = 0.25 + Math.random() * 0.35
      for (let i = 0; i < 900; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / 160)
    }
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.25 * intensity, now + 0.35)
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  const hp = ctx.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = 180
  src.connect(hp).connect(g).connect(out)
  src.start(now)
}

/** Label used under the hit flash / ticker. */
export function shotLabel(s: Shot) {
  return `${SHOT_LABELS[s.type]}${s.speedKmh ? ` · ${s.speedKmh} km/h` : ""}`
}
