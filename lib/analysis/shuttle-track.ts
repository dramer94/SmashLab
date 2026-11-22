import type { CourtMarks } from "./geometry"
import { defaultDetectOptions, defaultLinkOptions, detectCandidates, linkTracks, type ShuttleCandidate, type ShuttlePoint } from "./shuttle"
import { playFrames, seekTo } from "./vision"
import type { Pt } from "./types"

/**
 * Browser pass that finds the shuttle in every frame of the given time
 * windows (the rallies). Runs at normal speed so no frame is skipped.
 */
export async function trackShuttle(
  video: HTMLVideoElement,
  corners: Pt[],
  marks: CourtMarks | undefined,
  windows: { start: number; end: number }[],
  offCamera: { start: number; end: number }[],
  onProgress: (frac: number) => void,
  signal?: AbortSignal
): Promise<ShuttlePoint[]> {
  if (!windows.length || corners.length !== 4) return []
  void marks
  const w = Math.min(640, video.videoWidth || 640)
  const h = Math.round((w * (video.videoHeight || 360)) / (video.videoWidth || 640))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const grey = () => {
    ctx.drawImage(video, 0, 0, w, h)
    const d = ctx.getImageData(0, 0, w, h).data
    const g = new Uint8Array(w * h)
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8
    return g
  }
  const isOff = (t: number) => offCamera.some((c) => t >= c.start && t <= c.end)

  // Empty-court background (grey) from frames spread over the rallies.
  const total = windows.reduce((a, x) => a + x.end - x.start, 0)
  const samples: Uint8Array[] = []
  for (let i = 0; i < 25 && samples.length < 21; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    let at = ((i + 0.5) / 25) * total
    let t = windows[0].start
    for (const x of windows) {
      if (at <= x.end - x.start) { t = x.start + at; break }
      at -= x.end - x.start
    }
    if (isOff(t)) continue
    await seekTo(video, t)
    samples.push(grey())
  }
  if (samples.length < 5) return []
  const bg = new Uint8Array(w * h)
  const tmp = new Uint8Array(samples.length)
  for (let p = 0; p < bg.length; p++) {
    for (let k = 0; k < samples.length; k++) tmp[k] = samples[k][p]
    tmp.sort()
    bg[p] = tmp[tmp.length >> 1]
  }

  // The shuttle flies above the court, often above the horizon of the floor,
  // so only the picture's width is limited: the court's span plus a margin.
  const xs = corners.map((c) => c.x * w)
  const minX = Math.min(...xs) - 0.12 * w
  const maxX = Math.max(...xs) + 0.12 * w
  const allowed = (x: number, y: number) => x >= minX && x <= maxX && y > 0.02 * h
  const dopt = defaultDetectOptions(w)
  const lopt = defaultLinkOptions(w)
  const out: ShuttlePoint[] = []
  let done = 0
  for (const win of windows) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    const frames: { t: number; g: Uint8Array }[] = []
    const visit = (t: number) => {
      frames.push({ t, g: isOff(t) ? new Uint8Array(0) : grey() })
      onProgress(Math.min(1, (done + (t - win.start)) / (total || 1)))
    }
    const ok = await playFrames(video, win.start, win.end, 1 / 60, visit, signal, 1)
    if (!ok) {
      // No frame callbacks: step by seeking at 25 fps.
      for (let t = win.start; t <= win.end; t += 0.04) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
        await seekTo(video, t)
        visit(t)
      }
    }
    done += win.end - win.start
    const cands: ShuttleCandidate[][] = frames.map((f, i) => {
      const a = frames[i - 1]
      const b = frames[i + 1]
      if (!a || !b || !f.g.length || !a.g.length || !b.g.length) return []
      return detectCandidates(a.g, f.g, b.g, w, h, dopt, allowed, bg)
    })
    const path = linkTracks(cands, lopt)
    path.forEach((p, i) => {
      if (p) out.push({ t: Math.round(frames[i].t * 1000) / 1000, x: Math.round((p.x / w) * 10000) / 10000, y: Math.round((p.y / h) * 10000) / 10000 })
    })
  }
  return out
}
