// For each tracked player, a few moments where they are clearly visible and apart from others.
import { readFileSync } from "node:fs"
import { applyHomography, computeHomography, markPoints } from "../../lib/analysis/geometry.ts"
import { positionAt } from "../../lib/analysis/engine.ts"
const s = JSON.parse(readFileSync(process.argv[2], "utf8"))
const H = computeHomography(markPoints(s.marks), s.corners)!
const W = 1280, Hh = 720
const out: Record<string, { t: number; x: number; y: number; h: number }[]> = {}
for (const side of ["far", "near"]) {
  for (let slot = 0; slot < 2; slot++) {
    const picks: { t: number; x: number; y: number; h: number }[] = []
    const frames = s.track.filter((f: any) => f[side][slot])
    for (let k = 0; k < 8 && picks.length < 4; k++) {
      const f = frames[Math.floor(((k + 0.5) / 8) * frames.length)]
      if (!f) continue
      const p = f[side][slot]
      // apart from every other tracked player by 1.5 m
      const othersClose = ["far", "near"].some((sd) => [0, 1].some((sl) => {
        if (sd === side && sl === slot) return false
        const q = positionAt(s.track, sd as any, sl, f.t)
        return q && Math.hypot(q.x - p.x, q.y - p.y) < 1.5
      }))
      if (othersClose) continue
      const a = applyHomography(H, p), b = applyHomography(H, { x: p.x + 0.5, y: p.y }), c = applyHomography(H, { x: p.x, y: p.y + 0.5 })
      const pxPerM = Math.max(Math.hypot((b.x - a.x) * W, (b.y - a.y) * Hh), Math.hypot((c.x - a.x) * W, (c.y - a.y) * Hh)) * 2
      picks.push({ t: f.t, x: a.x * W, y: a.y * Hh, h: Math.max(60, pxPerM * 2.1) })
    }
    out[`${side}${slot}`] = picks
  }
}
console.log(JSON.stringify({ names: s.settings.players, colors: s.playerColors, picks: out }))
