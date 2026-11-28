import { readFileSync, writeFileSync } from "node:fs"
import { applyHomography, computeHomography, markPoints } from "../../lib/analysis/geometry.ts"
import { positionAt } from "../../lib/analysis/engine.ts"
const s = JSON.parse(readFileSync(process.argv[2], "utf8"))
const H = computeHomography(markPoints(s.marks), s.corners)!
const W = 1920, Hh = 1080
const boxes: { frame: number; key: string; x0: number; y0: number; size: number }[] = []
for (let sec = 1; sec <= 300; sec++) {
  const t = sec - 1 + s.range.start
  for (const side of ["far", "near"]) for (let slot = 0; slot < 2; slot++) {
    const p = positionAt(s.track, side as any, slot, t)
    if (!p) continue
    const others = ["far", "near"].flatMap((sd) => [0, 1].map((sl) => (sd === side && sl === slot ? null : positionAt(s.track, sd as any, sl, t)))).filter(Boolean) as any[]
    if (others.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1.2)) continue
    const a = applyHomography(H, p), b = applyHomography(H, { x: p.x + 0.5, y: p.y }), c = applyHomography(H, { x: p.x, y: p.y + 0.5 })
    const pxPerM = Math.max(Math.hypot((b.x - a.x) * W, (b.y - a.y) * Hh), Math.hypot((c.x - a.x) * W, (c.y - a.y) * Hh)) * 2
    const h = pxPerM * 1.75
    const size = Math.max(40, h * 0.42)
    boxes.push({ frame: sec, key: `${side}${slot}`, x0: Math.round(a.x * W - size / 2), y0: Math.round(a.y * Hh - h * 1.02), size: Math.round(size) })
  }
}
writeFileSync(process.argv[3], JSON.stringify(boxes))
console.log("head boxes", boxes.length)
