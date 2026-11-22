"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { applyHomography, computeHomography, courtLines, MARK_LINES, markPoints, validateCorners, type CourtMarks } from "@/lib/analysis/geometry"
import type { Pt } from "@/lib/analysis/types"

const MARGIN = 0.1

/** Names of the four points for the chosen lines, in marking order. */
export function pointNames(marks: CourtMarks): string[] {
  if (marks.top === "farBase" && marks.bottom === "nearBase") return ["Far-left corner", "Far-right corner", "Near-right corner", "Near-left corner"]
  const short = (l: keyof typeof MARK_LINES) => MARK_LINES[l].label.replace(/ \(.*\)$/, "")
  return [`${short(marks.top)}, left`, `${short(marks.top)}, right`, `${short(marks.bottom)}, right`, `${short(marks.bottom)}, left`]
}

export const DEFAULT_CORNERS: Pt[] = [
  { x: 0.33, y: 0.32 },
  { x: 0.67, y: 0.32 },
  { x: 0.88, y: 0.9 },
  { x: 0.12, y: 0.9 },
]

/**
 * Lets the user drag four points onto the outer corners of the court.
 * Points may sit a little outside the picture when a corner is cut off.
 */
export function CourtMarker({
  videoUrl,
  width,
  height,
  corners,
  onChange,
  frameTime,
  marks,
}: {
  videoUrl: string
  width: number
  height: number
  corners: Pt[]
  onChange: (c: Pt[]) => void
  frameTime: number
  marks: CourtMarks
}) {
  const CORNER_NAMES = pointNames(marks)
  const videoRef = useRef<HTMLVideoElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    const v = videoRef.current
    if (v && Math.abs(v.currentTime - frameTime) > 0.01) v.currentTime = frameTime
  }, [frameTime])

  const vbW = width * (1 + 2 * MARGIN)
  const vbH = height * (1 + 2 * MARGIN)
  const toPx = (p: Pt) => ({ x: (p.x + MARGIN) * width, y: (p.y + MARGIN) * height })

  const eventToNorm = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * (1 + 2 * MARGIN) - MARGIN
    const y = ((e.clientY - r.top) / r.height) * (1 + 2 * MARGIN) - MARGIN
    const clamp = (v: number) => Math.max(-MARGIN, Math.min(1 + MARGIN, v))
    return { x: clamp(x), y: clamp(y) }
  }

  const problems = corners.length === 4 ? validateCorners(corners) : []
  const lines = useMemo(() => {
    if (corners.length !== 4 || validateCorners(corners).length) return []
    const H = computeHomography(markPoints(marks), corners)
    if (!H) return []
    return courtLines().map((l) => {
      const a = applyHomography(H, l.a)
      const b = applyHomography(H, l.b)
      return { a: toPx(a), b: toPx(b), kind: l.kind }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corners, width, height, marks])

  const onKey = (e: React.KeyboardEvent) => {
    if (selected == null) return
    const step = (e.shiftKey ? 5 : 1) / width
    const d: Record<string, Pt> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const m = d[e.key]
    if (!m) return
    e.preventDefault()
    onChange(corners.map((c, i) => (i === selected ? { x: c.x + m.x, y: c.y + m.y } : c)))
  }

  const r = Math.max(width, height) * 0.012

  return (
    <div className="space-y-3">
      <div
        className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-black/60 select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        style={{ aspectRatio: `${vbW} / ${vbH}` }}
        tabIndex={0}
        onKeyDown={onKey}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          className="absolute"
          style={{
            left: `${(MARGIN / (1 + 2 * MARGIN)) * 100}%`,
            top: `${(MARGIN / (1 + 2 * MARGIN)) * 100}%`,
            width: `${(1 / (1 + 2 * MARGIN)) * 100}%`,
            height: `${(1 / (1 + 2 * MARGIN)) * 100}%`,
          }}
          onLoadedData={(e) => (e.currentTarget.currentTime = frameTime)}
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${vbW} ${vbH}`}
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onPointerDown={(e) => {
            if (corners.length < 4 && drag == null) {
              onChange([...corners, eventToNorm(e)])
              setSelected(corners.length)
            }
          }}
          onPointerMove={(e) => {
            if (drag == null) return
            const p = eventToNorm(e)
            onChange(corners.map((c, i) => (i === drag ? p : c)))
          }}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          <rect
            x={MARGIN * width}
            y={MARGIN * height}
            width={width}
            height={height}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeDasharray="6 6"
          />
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              stroke={l.kind === "net" ? "#f9fafb" : "#facc15"}
              strokeWidth={(l.kind === "outer" ? 3 : 2) * (width / 1280)}
              strokeOpacity={0.9}
            />
          ))}
          {corners.length >= 2 && !lines.length && (
            <polygon
              points={corners.map((c) => { const p = toPx(c); return `${p.x},${p.y}` }).join(" ")}
              fill="rgba(250,204,21,0.12)"
              stroke="#facc15"
              strokeWidth={2 * (width / 1280)}
            />
          )}
          {corners.map((c, i) => {
            const p = toPx(c)
            return (
              <g
                key={i}
                className="cursor-grab"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                  setDrag(i)
                  setSelected(i)
                }}
              >
                <circle cx={p.x} cy={p.y} r={r * 2.6} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={r} fill={selected === i ? "#3b82f6" : "#facc15"} stroke="#0a0e1a" strokeWidth={r * 0.35} />
                <line x1={p.x - r * 2} y1={p.y} x2={p.x + r * 2} y2={p.y} stroke="#0a0e1a" strokeWidth={r * 0.2} />
                <line x1={p.x} y1={p.y - r * 2} x2={p.x} y2={p.y + r * 2} stroke="#0a0e1a" strokeWidth={r * 0.2} />
                <text x={p.x + r * 1.6} y={p.y - r * 1.6} fill="#f9fafb" fontSize={r * 2.2} fontWeight={700} stroke="#0a0e1a" strokeWidth={r * 0.4} paintOrder="stroke">
                  {i + 1}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {CORNER_NAMES.map((n, i) => (
          <button
            key={n}
            type="button"
            onClick={() => setSelected(i)}
            className={`rounded-md border px-2.5 py-1 ${selected === i ? "border-blue-500 bg-blue-500/15 text-white" : "border-white/10 text-gray-400"} ${i < corners.length ? "" : "opacity-50"}`}
          >
            {i + 1} · {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { onChange([]); setSelected(null) }}
          className="ml-auto rounded-md border border-white/10 px-2.5 py-1 text-gray-300 hover:bg-white/5"
        >
          Clear and tap corners
        </button>
        <button
          type="button"
          onClick={() => { onChange(DEFAULT_CORNERS); setSelected(null) }}
          className="rounded-md border border-white/10 px-2.5 py-1 text-gray-300 hover:bg-white/5"
        >
          Reset
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {corners.length < 4
          ? `Tap point ${corners.length + 1}: ${CORNER_NAMES[corners.length].toLowerCase()}, where it meets the outer sideline.`
          : "Drag each point onto the spot where the line meets the outer sideline on the floor. Select a point and use the arrow keys (Shift for bigger steps) to fine-tune. A point cut off by the picture can sit in the dashed margin."}
      </p>
      {problems.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {problems.map((p) => <div key={p}>{p}</div>)}
        </div>
      )}
    </div>
  )
}
