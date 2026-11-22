"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Download, Film, Pause, Play, Plus, Trash2 } from "lucide-react"
import { buildOverlayModel, drawOverlay, REPLAY_AFTER, REPLAY_BEFORE, REPLAY_RATE, SIDE_COLORS, type OverlayOptions } from "@/lib/analysis/overlay"
import { SHOT_LABELS } from "@/lib/analysis/engine"
import { SHOT_TYPES, type AnalysisResult, type Session, type Shot, type ShotEdit, type Side } from "@/lib/analysis/types"

function fmt(t: number) {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, "0")}`
}

export function VideoReview({
  session,
  result,
  videoUrl,
  selectedId,
  onSelect,
  onEditShot,
  onAddShot,
  seekRequest,
}: {
  session: Session
  result: AnalysisResult
  videoUrl: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onEditShot: (id: string, edit: ShotEdit) => void
  onAddShot: (t: number) => void
  seekRequest: { t: number; n: number } | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [t, setT] = useState(session.range.start)
  const tRef = useRef(t)
  tRef.current = t
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [opts, setOpts] = useState<OverlayOptions>({ courtLines: false, miniMap: true, labels: true })
  const [exporting, setExporting] = useState<number | null>(null)
  const [exportUrl, setExportUrl] = useState<{ url: string; ext: string } | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportStop = useRef<(() => void) | null>(null)
  /** Shot being previewed in slow motion in the player, if any. */
  const previewRef = useRef<Shot | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const model = useMemo(() => buildOverlayModel(session, result), [session, result])
  const { start, end } = session.range
  const span = Math.max(0.001, end - start)
  const vw = session.video.width || 1280
  const vh = session.video.height || 720
  const cw = Math.min(1280, vw)
  const ch = Math.round((cw * vh) / vw)

  const draw = useCallback(() => {
    const c = canvasRef.current
    const v = videoRef.current
    if (!c) return
    const ctx = c.getContext("2d")!
    ctx.clearRect(0, 0, c.width, c.height)
    drawOverlay(ctx, c.width, c.height, v ? v.currentTime : tRef.current, model, opts, previewRef.current)
  }, [model, opts])

  // Redraw loop while playing; single redraw otherwise.
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const v = videoRef.current
      if (v) {
        const pv = previewRef.current
        if (pv && v.currentTime >= Math.min(end, pv.t + REPLAY_AFTER)) {
          v.pause()
          v.playbackRate = rate
          previewRef.current = null
          setPreviewing(false)
        }
        if (v.currentTime >= end && !v.paused) { v.pause(); v.currentTime = end }
        tRef.current = v.currentTime
        setT(v.currentTime)
      }
      draw()
      if (playing) raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [playing, draw, end, rate])

  const seek = useCallback((time: number) => {
    const clamped = Math.max(start, Math.min(end, time))
    const v = videoRef.current
    if (v) v.currentTime = clamped
    setT(clamped)
  }, [start, end])

  useEffect(() => {
    if (seekRequest) seek(seekRequest.t)
  }, [seekRequest, seek])

  const previewReplay = useCallback((shot: Shot) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    previewRef.current = shot
    setPreviewing(true)
    const from = Math.max(start, shot.t - REPLAY_BEFORE)
    v.addEventListener("seeked", () => {
      v.playbackRate = REPLAY_RATE
      v.play().catch(() => {})
    }, { once: true })
    v.currentTime = from
    setT(from)
  }, [start])

  const toggle = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (previewRef.current) {
      previewRef.current = null
      setPreviewing(false)
      v.playbackRate = rate
    }
    if (v.paused) {
      if (v.currentTime >= end - 0.05) v.currentTime = start
      v.play().catch(() => {})
    } else v.pause()
  }, [start, end, rate])

  const shots = result.shots
  const selIdx = shots.findIndex((s) => s.id === selectedId)
  const selected = selIdx >= 0 ? shots[selIdx] : null

  const jump = useCallback((dir: 1 | -1) => {
    let idx: number
    if (selIdx >= 0) idx = selIdx + dir
    else idx = dir > 0 ? shots.findIndex((s) => s.t > t + 0.01) : (() => { let k = -1; shots.forEach((s, i) => { if (s.t < t - 0.01) k = i }); return k })()
    const s = shots[idx]
    if (!s) return
    onSelect(s.id)
    videoRef.current?.pause()
    seek(s.t - 0.6)
  }, [selIdx, shots, t, onSelect, seek])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return
      if (e.key === " ") { e.preventDefault(); toggle() }
      else if (e.key === "ArrowRight" && e.shiftKey) { e.preventDefault(); jump(1) }
      else if (e.key === "ArrowLeft" && e.shiftKey) { e.preventDefault(); jump(-1) }
      else if (e.key === "a" || e.key === "A") onAddShot(Math.round((videoRef.current?.currentTime ?? t) * 1000) / 1000)
      else if ((e.key === "Delete" || e.key === "Backspace") && selected) { e.preventDefault(); onEditShot(selected.id, { deleted: true }); onSelect(null) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle, jump, onAddShot, onEditShot, onSelect, selected, t])

  const startExport = async () => {
    const v = videoRef.current
    if (!v || typeof MediaRecorder === "undefined") {
      setExportError("This browser cannot record video. Try Chrome or Edge on a computer.")
      return
    }
    setExportError(null)
    if (exportUrl) URL.revokeObjectURL(exportUrl.url)
    setExportUrl(null)
    const canvas = document.createElement("canvas")
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext("2d")!
    const stream = canvas.captureStream(30)
    try {
      const vStream = (v as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream })
      const src = vStream.captureStream?.() ?? vStream.mozCaptureStream?.()
      src?.getAudioTracks().forEach((tr) => stream.addTrack(tr))
    } catch { /* no audio capture */ }
    const types = ["video/mp4;codecs=avc1,mp4a", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    const mime = types.find((m) => MediaRecorder.isTypeSupported(m)) ?? ""
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)

    // The recording plan: the clip in order, with slow-motion replays of the
    // marked shots inserted just after each rally ends.
    type Seg = { from: number; to: number; rate: number; replay: Shot | null }
    const plan: Seg[] = []
    let cursor = start
    for (const r of result.rallies) {
      const reps = r.shots.filter((x) => x.replay)
      const at = Math.min(end, r.end + 0.8)
      if (!reps.length || at <= cursor) continue
      plan.push({ from: cursor, to: at, rate: 1, replay: null })
      for (const x of reps) {
        plan.push({ from: Math.max(start, x.t - REPLAY_BEFORE), to: Math.min(end, x.t + REPLAY_AFTER), rate: REPLAY_RATE, replay: x })
      }
      cursor = at
    }
    if (cursor < end) plan.push({ from: cursor, to: end, rate: 1, replay: null })
    const totalS = plan.reduce((a, g) => a + (g.to - g.from) / g.rate, 0)
    let doneS = 0

    let raf = 0
    let stopped = false
    let wake: (() => void) | null = null
    const finish = () => {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(raf)
      v.pause()
      wake?.()
    }
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop())
      const type = rec.mimeType || "video/webm"
      const blob = new Blob(chunks, { type })
      setExportUrl({ url: URL.createObjectURL(blob), ext: type.includes("mp4") ? "mp4" : "webm" })
      setExporting(null)
      exportStop.current = null
    }
    exportStop.current = finish
    const seekTo = (time: number) =>
      new Promise<void>((r) => {
        v.addEventListener("seeked", () => r(), { once: true })
        v.currentTime = time
      })
    const paint = (replay: Shot | null) => {
      ctx.drawImage(v, 0, 0, cw, ch)
      drawOverlay(ctx, cw, ch, v.currentTime, model, opts, replay)
    }
    const playSeg = (g: Seg) =>
      new Promise<void>((resolve) => {
        wake = resolve
        v.playbackRate = g.rate
        const frame = () => {
          if (stopped) return resolve()
          paint(g.replay)
          setExporting(Math.min(1, (doneS + Math.max(0, v.currentTime - g.from) / g.rate) / (totalS || 1)))
          if (v.currentTime >= g.to || v.ended) {
            v.pause()
            return resolve()
          }
          raf = requestAnimationFrame(frame)
        }
        v.play().then(() => { raf = requestAnimationFrame(frame) }).catch(() => { finish(); resolve() })
      })

    v.pause()
    await seekTo(start)
    paint(null)
    setExporting(0)
    rec.start(1000)
    for (const g of plan) {
      if (stopped) break
      if (Math.abs(v.currentTime - g.from) > 0.05) {
        // Pause the recorder while jumping so the jump itself is not filmed.
        if (rec.state === "recording") rec.pause()
        await seekTo(g.from)
        paint(g.replay)
        if (rec.state === "paused") rec.resume()
      }
      await playSeg(g)
      doneS += (g.to - g.from) / g.rate
    }
    stopped = true
    v.playbackRate = rate
    if (rec.state !== "inactive") rec.stop()
  }

  const replayCount = result.shots.filter((x) => x.replay).length
  const pickReplays = () => {
    // The three fastest shots (one per rally), smashes first.
    const best = new Map<number, Shot>()
    for (const x of result.shots) {
      if (x.speedKmh == null) continue
      const cur = best.get(x.rallyIndex)
      const score = (y: Shot) => (y.type === "smash" ? 1000 : 0) + (y.speedKmh ?? 0)
      if (!cur || score(x) > score(cur)) best.set(x.rallyIndex, x)
    }
    const top = [...best.values()].sort((a, b) => (b.type === "smash" ? 1000 : 0) + (b.speedKmh ?? 0) - ((a.type === "smash" ? 1000 : 0) + (a.speedKmh ?? 0))).slice(0, 3)
    top.forEach((x) => onEditShot(x.id, { replay: true }))
  }

  const editBtn = "rounded-md border border-white/10 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-white/5"

  return (
    <div className="space-y-3">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black" style={{ aspectRatio: `${vw} / ${vh}` }}>
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full"
            onPlay={() => setPlaying(true)}
            onPause={() => { setPlaying(false); setT(videoRef.current?.currentTime ?? t) }}
            onSeeked={() => { setT(videoRef.current?.currentTime ?? t); draw() }}
            onLoadedMetadata={(e) => { e.currentTarget.currentTime = t; e.currentTarget.playbackRate = rate }}
            onClick={toggle}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-gray-400">
            Select the original video again (top of the page) to watch it with the overlay. The stats below work without it.
          </div>
        )}
        <canvas ref={canvasRef} width={cw} height={ch} className="pointer-events-none absolute inset-0 h-full w-full" />
        {exporting != null && (
          <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-2 text-sm text-white">
            Recording overlay video… {Math.round(exporting * 100)}%
            <button type="button" className="ml-3 underline" onClick={() => exportStop.current?.()}>Stop</button>
          </div>
        )}
      </div>

      {/* Transport */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggle} disabled={!videoUrl} className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40" aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => jump(-1)} className={editBtn} aria-label="Previous shot" title="Previous shot (Shift+←)"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => jump(1)} className={editBtn} aria-label="Next shot" title="Next shot (Shift+→)"><ChevronRight className="h-4 w-4" /></button>
        <span className="tabular-nums text-sm text-gray-300">{fmt(t - start)} / {fmt(span)}</span>
        <select
          value={rate}
          onChange={(e) => { const r = Number(e.target.value); setRate(r); if (videoRef.current) videoRef.current.playbackRate = r }}
          className="rounded-md border border-white/10 bg-[var(--card)] px-2 py-1.5 text-sm text-gray-200"
          aria-label="Playback speed"
        >
          {[0.25, 0.5, 1, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
        <button type="button" onClick={() => onAddShot(Math.round(t * 1000) / 1000)} className={`${editBtn} inline-flex items-center gap-1`} title="Add a shot at the playhead (A)">
          <Plus className="h-4 w-4" /> Add shot here
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm text-gray-400">
          {([["courtLines", "Court lines"], ["labels", "Names"], ["miniMap", "Mini map"]] as const).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} className="accent-blue-500" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div
        className="relative h-14 cursor-pointer rounded-lg border border-white/10 bg-[var(--card)]"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          seek(start + ((e.clientX - r.left) / r.width) * span)
          onSelect(null)
        }}
        role="slider"
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={t - start}
      >
        {result.rallies.map((r) => (
          <div
            key={r.id}
            className="absolute top-1 bottom-1 rounded bg-white/[0.06]"
            style={{ left: `${((r.start - start) / span) * 100}%`, width: `max(4px, ${((r.end - r.start) / span) * 100}%)` }}
            title={`Rally ${r.index + 1}`}
          />
        ))}
        {(session.offCamera ?? []).map((c) => (
          <div
            key={c.start}
            className="absolute top-0 bottom-0"
            style={{
              left: `${((c.start - start) / span) * 100}%`,
              width: `${((c.end - c.start) / span) * 100}%`,
              background: "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 3px, transparent 3px 7px)",
            }}
            title="Other camera angle (skipped)"
          />
        ))}
        {shots.map((s) => (
          <button
            key={s.id}
            type="button"
            title={`${fmt(s.t - start)} · ${SHOT_LABELS[s.type]} · ${s.side}`}
            aria-label={`Shot at ${fmt(s.t - start)}, ${SHOT_LABELS[s.type]}`}
            onPointerDown={(e) => { e.stopPropagation(); onSelect(s.id); videoRef.current?.pause(); seek(s.t - 0.6) }}
            className="absolute -translate-x-1/2 rounded-full"
            style={{
              left: `${((s.t - start) / span) * 100}%`,
              top: s.side === "far" ? 8 : 30,
              width: s.id === selectedId ? 16 : 11,
              height: s.id === selectedId ? 16 : 11,
              marginTop: s.id === selectedId ? -2 : 0,
              background: s.manual ? "transparent" : SIDE_COLORS[s.side],
              border: `2px solid ${s.id === selectedId ? "#fff" : s.replay ? "#ef4444" : s.manual ? SIDE_COLORS[s.side] : "#111827"}`,
            }}
          />
        ))}
        <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: `${((t - start) / span) * 100}%` }} />
        <span className="pointer-events-none absolute left-1.5 top-0.5 text-[10px] uppercase tracking-wide text-gray-500">far</span>
        <span className="pointer-events-none absolute left-1.5 bottom-0.5 text-[10px] uppercase tracking-wide text-gray-500">near</span>
      </div>

      {/* Selected shot editor */}
      {selected ? (
        <div className="rounded-lg border border-white/10 bg-[var(--card)] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-white">Rally {selected.rallyIndex + 1}, shot {selected.indexInRally + 1}</span>
            <span className="text-gray-400">at {fmt(selected.t - start)}</span>
            {selected.speedKmh != null && <span className="text-gray-400">· ~{selected.speedKmh} km/h</span>}
            {selected.manual && <span className="rounded bg-white/10 px-1.5 text-xs text-gray-300">added by you</span>}
            <button
              type="button"
              onClick={() => onEditShot(selected.id, { replay: !selected.replay })}
              className={`${editBtn} inline-flex items-center gap-1 ${selected.replay ? "border-red-500/60 bg-red-500/15 text-white" : ""}`}
              title="Show this shot again in slow motion in the recorded video"
            >
              <Film className="h-4 w-4" /> Slow-mo replay {selected.replay ? "on" : "off"}
            </button>
            {videoUrl && (
              <button type="button" onClick={() => previewReplay(selected)} disabled={previewing} className={`${editBtn} disabled:opacity-50`}>
                {previewing ? "Playing…" : "Preview"}
              </button>
            )}
            <button type="button" className={`${editBtn} ml-auto inline-flex items-center gap-1 text-red-300`} onClick={() => { onEditShot(selected.id, { deleted: true }); onSelect(null) }}>
              <Trash2 className="h-4 w-4" /> Not a shot
            </button>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-gray-500">Hit by</span>
            {(["near", "far"] as Side[]).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => onEditShot(selected.id, { side })}
                className={`rounded-md border px-2.5 py-1 text-sm ${selected.side === side ? "text-white" : "border-white/10 text-gray-400"}`}
                style={selected.side === side ? { borderColor: SIDE_COLORS[side], background: SIDE_COLORS[side] + "26" } : undefined}
              >
                {session.settings.players[side].map((p) => p.name).join(" / ")} ({side})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-gray-500">Shot type</span>
            {SHOT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onEditShot(selected.id, { type })}
                className={`rounded-md border px-2.5 py-1 text-sm ${selected.type === type ? "border-blue-500 bg-blue-500/15 text-white" : "border-white/10 text-gray-400 hover:text-gray-200"}`}
              >
                {SHOT_LABELS[type]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Changing who hit a shot re-pins the order: the following shots in the rally alternate from it. Shortcuts: Space play, Shift+←/→ previous/next shot, A add shot, Delete remove.
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          Tap a dot on the timeline to check a shot. Dots on top are far-side hits, dots below are near-side hits; hollow dots are shots you added.
          {session.offCamera?.length ? " Striped parts were filmed by another camera and are skipped." : ""}
        </p>
      )}

      {videoUrl && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={pickReplays} disabled={exporting != null} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50" title="Mark the three fastest shots for slow-motion replays">
            <Film className="h-4 w-4" /> {replayCount ? `${replayCount} replay${replayCount > 1 ? "s" : ""} marked · add best smashes` : "Add replays of the best smashes"}
          </button>
          <button type="button" onClick={startExport} disabled={exporting != null} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50">
            <Download className="h-4 w-4" /> Record video with overlay
          </button>
          {exportUrl && (
            <a href={exportUrl.url} download={`${session.video.name.replace(/\.[^.]+$/, "")}-smashlab.${exportUrl.ext}`} className="text-sm font-medium text-blue-400 hover:text-blue-300">
              Download recorded video
            </a>
          )}
          {exportError && <span className="text-sm text-amber-300">{exportError}</span>}
          <span className="text-xs text-gray-500">
            Plays the clip once in real time and records it with the overlay as shown above{replayCount ? ", with slow-motion replays after the rallies they belong to" : ""}. Shots outlined in red on the timeline get a replay.
          </span>
        </div>
      )}
    </div>
  )
}
