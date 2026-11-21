"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, FileJson, FolderOpen, Loader2, RotateCcw, Trash2, Upload, Video } from "lucide-react"
import { CourtMarker, DEFAULT_CORNERS } from "@/components/analysis/court-marker"
import { VideoReview } from "@/components/analysis/video-review"
import { CourtMap, PlayersTable, RallyList, ShotTypeChart, SummaryTiles } from "@/components/analysis/results-panels"
import { decodeAudio, detectOnsets, MIN_CANDIDATE_RISE_DB } from "@/lib/analysis/audio"
import { trackPlayers } from "@/lib/analysis/vision"
import { buildResult, other } from "@/lib/analysis/engine"
import { validateCorners } from "@/lib/analysis/geometry"
import { deleteSession, isSession, listSaved, loadSession, saveSession, videoKey, type SavedEntry } from "@/lib/analysis/storage"
import { SIDE_COLORS } from "@/lib/analysis/overlay"
import type { AnalysisSettings, MatchFormat, Pt, Session, ShotEdit, Side, VideoMeta } from "@/lib/analysis/types"

const MAX_CLIP_S = 300
const MIN_CLIP_S = 3

type Step = "upload" | "mark" | "processing" | "results"

interface Draft {
  corners: Pt[]
  range: { start: number; end: number }
  frameTime: number
  settings: AnalysisSettings
}

function hashId(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function defaultPlayers(format: MatchFormat): AnalysisSettings["players"] {
  return format === "doubles"
    ? { near: [{ name: "Near 1", weightKg: 65 }, { name: "Near 2", weightKg: 65 }], far: [{ name: "Far 1", weightKg: 65 }, { name: "Far 2", weightKg: 65 }] }
    : { near: [{ name: "Near player", weightKg: 65 }], far: [{ name: "Far player", weightKg: 65 }] }
}

function defaultSettings(format: MatchFormat = "singles"): AnalysisSettings {
  return { format, sensitivityDb: 12, rallyGapS: 3.5, firstServer: "near", players: defaultPlayers(format) }
}

function readMeta(url: string, file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video")
    v.preload = "metadata"
    v.muted = true
    v.onloadedmetadata = () => {
      if (!v.videoWidth || !Number.isFinite(v.duration)) return reject(new Error("no video"))
      resolve({ name: file.name, size: file.size, lastModified: file.lastModified, duration: v.duration, width: v.videoWidth, height: v.videoHeight })
    }
    v.onerror = () => reject(new Error("unreadable"))
    v.src = url
  })
}

const input = "w-full rounded-md border border-white/10 bg-[var(--background)] px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
const btn = "inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5"
const primary = "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"

export function AnalysisApp() {
  const [step, setStep] = useState<Step>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [progress, setProgress] = useState({ stage: "", frac: 0 })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [seekRequest, setSeekRequest] = useState<{ t: number; n: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const jsonInput = useRef<HTMLInputElement>(null)

  useEffect(() => setSaved(listSaved()), [])
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }, [videoUrl])

  const result = useMemo(() => (session ? buildResult(session) : null), [session])

  // Persist edits (debounced).
  useEffect(() => {
    if (!session || !result) return
    const id = setTimeout(() => {
      saveSession(session, result.totals.shots)
      setSaved(listSaved())
    }, 400)
    return () => clearTimeout(id)
  }, [session, result])

  const update = useCallback((fn: (s: Session) => Session) => {
    setSession((s) => (s ? { ...fn(s), updatedAt: Date.now() } : s))
  }, [])

  const onFile = async (f: File) => {
    setError(null)
    const url = URL.createObjectURL(f)
    let m: VideoMeta
    try {
      m = await readMeta(url, f)
    } catch {
      URL.revokeObjectURL(url)
      setError("This browser could not open that video. Use an MP4 or MOV from your phone camera, or try Chrome.")
      return
    }
    setFile(f)
    setVideoUrl(url)
    setMeta(m)
    // Re-selecting the video for an analysis that is already open.
    if (session && videoKey(session.video) === videoKey(m)) return
    const existing = loadSession(hashId(videoKey(m)))
    if (existing) {
      setSession(existing)
      setStep("results")
      return
    }
    setSession(null)
    const end = Math.min(m.duration, MAX_CLIP_S)
    setDraft({ corners: DEFAULT_CORNERS, range: { start: 0, end }, frameTime: Math.min(1, m.duration / 2), settings: defaultSettings() })
    setStep("mark")
  }

  const run = async () => {
    if (!file || !videoUrl || !meta || !draft) return
    const ac = new AbortController()
    abortRef.current = ac
    setStep("processing")
    setError(null)
    try {
      setProgress({ stage: "Listening for shot sounds", frac: 0 })
      const audio = await decodeAudio(file, draft.range.start, draft.range.end)
      const onsets = audio ? detectOnsets(audio.samples, audio.sampleRate, draft.range.start) : []
      if (ac.signal.aborted) throw new DOMException("Aborted", "AbortError")
      setProgress({ stage: "Listening for shot sounds", frac: 0.12 })

      const v = document.createElement("video")
      v.muted = true
      v.preload = "auto"
      v.playsInline = true
      v.src = videoUrl
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res()
        v.onerror = () => rej(new Error("The video could not be decoded."))
      })
      const tracked = await trackPlayers(
        v,
        draft.corners,
        draft.range,
        draft.settings.format,
        (stage, frac) => setProgress({ stage, frac: stage.startsWith("Reading") ? 0.12 + frac * 0.13 : 0.25 + frac * 0.75 }),
        ac.signal
      )
      v.removeAttribute("src")
      v.load()

      const warnings = [...tracked.warnings]
      if (!audio) warnings.unshift("No sound could be read from this video, so shots were not counted automatically. Add them on the timeline with \"Add shot here\".")
      else if (onsets.filter((o) => o.rise >= draft.settings.sensitivityDb).length < 3)
        warnings.unshift("Very few shot sounds were heard. Raise the sensitivity in Settings, or film closer to the court with less background noise.")

      const prev = session && videoKey(session.video) === videoKey(meta) ? session : null
      const s: Session = {
        version: 1,
        id: hashId(videoKey(meta)),
        createdAt: prev?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        video: meta,
        range: draft.range,
        corners: draft.corners,
        settings: draft.settings,
        onsets,
        track: tracked.track,
        detection: tracked.detection,
        warnings,
        manualShots: prev?.manualShots ?? [],
        edits: prev?.edits ?? {},
        winners: prev?.winners ?? {},
        hasAudio: !!audio,
      }
      setSession(s)
      setSelectedId(null)
      setStep("results")
    } catch (e) {
      if ((e as DOMException).name === "AbortError") setStep("mark")
      else {
        setError((e as Error).message || "Analysis failed.")
        setStep("mark")
      }
    } finally {
      abortRef.current = null
    }
  }

  const remark = () => {
    if (!session) return
    setDraft({ corners: session.corners, range: session.range, frameTime: session.range.start + 0.5, settings: session.settings })
    setStep("mark")
  }

  const openSaved = (id: string) => {
    const s = loadSession(id)
    if (!s) return
    setSession(s)
    setSelectedId(null)
    if (!meta || videoKey(meta) !== videoKey(s.video)) {
      setVideoUrl(null)
      setFile(null)
      setMeta(null)
    }
    setStep("results")
  }

  const importJson = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      if (!isSession(data)) throw new Error()
      setSession(data)
      setVideoUrl(null)
      setFile(null)
      setMeta(null)
      setStep("results")
    } catch {
      setError("That file is not a SmashLab rally analysis.")
    }
  }

  const exportJson = () => {
    if (!session) return
    const blob = new Blob([JSON.stringify(session)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${session.video.name.replace(/\.[^.]+$/, "")}-analysis.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const goShot = (id: string) => {
    const s = result?.shots.find((x) => x.id === id)
    if (!s) return
    setSelectedId(id)
    setSeekRequest({ t: s.t - 0.6, n: Date.now() })
    document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const editShot = useCallback((id: string, edit: ShotEdit) => {
    update((s) => {
      if (edit.deleted && s.manualShots.some((m) => m.id === id)) {
        return { ...s, manualShots: s.manualShots.filter((m) => m.id !== id) }
      }
      return { ...s, edits: { ...s.edits, [id]: { ...s.edits[id], ...edit } } }
    })
  }, [update])

  const addShot = useCallback((t: number) => {
    const id = `m${Math.round(t * 1000)}`
    update((s) => (s.manualShots.some((m) => m.id === id) ? s : { ...s, manualShots: [...s.manualShots, { id, t }] }))
    setSelectedId(id)
  }, [update])

  const videoPicker = (
    <input
      ref={fileInput}
      type="file"
      accept="video/*,.mp4,.mov,.m4v,.webm"
      className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = "" }}
    />
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {videoPicker}
      <input ref={jsonInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = "" }} />

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Rally Analysis</h1>
          <p className="mt-1 max-w-2xl text-gray-400">
            Analyse a video of your own game: shots, shot types, rally score, shuttle speed, footwork distance and where you played on court.
            Everything runs in your browser and the video stays on your device.
          </p>
        </div>
        <Steps step={step} />
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {step === "upload" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
              className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors ${dragOver ? "border-blue-500 bg-blue-500/10" : "border-white/15 bg-[var(--card)] hover:border-white/30"}`}
            >
              <Upload className="mb-3 h-10 w-10 text-blue-400" />
              <span className="text-lg font-semibold text-white">Choose a match video</span>
              <span className="mt-1 text-sm text-gray-400">or drop it here · MP4, MOV or WebM · up to {MAX_CLIP_S / 60} minutes are analysed</span>
            </button>
            <div className="mt-6 rounded-xl border border-white/10 bg-[var(--card)] p-5">
              <h2 className="mb-3 font-semibold text-white">How it works</h2>
              <ol className="grid gap-3 text-sm text-gray-300 sm:grid-cols-2">
                <li><span className="font-semibold text-white">1. Pick a video.</span> One or more rallies, filmed from a still phone.</li>
                <li><span className="font-semibold text-white">2. Mark the court.</span> Drag four points onto the outer corners so player positions can be measured in metres.</li>
                <li><span className="font-semibold text-white">3. Analyse.</span> Shots are found from the sound of each hit; players are found by comparing each frame with the empty court.</li>
                <li><span className="font-semibold text-white">4. Check and fix.</span> Remove false shots, add missed ones, change shot types or rally winners. The stats update straight away.</li>
              </ol>
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-xl border border-white/10 bg-[var(--card)] p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-white"><Video className="h-4 w-4 text-blue-400" /> Filming tips</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-300">
                <li>Keep the phone still: a tripod, or propped against something.</li>
                <li>Film from behind a baseline, at chest height or higher, so the whole court and net are in view.</li>
                <li>Keep sound on. Each hit is counted from its sound, so a quieter hall works best.</li>
                <li>Don’t zoom or follow the shuttle while recording.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-[var(--card)] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-white">Saved on this device</h2>
                <button type="button" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300" onClick={() => jsonInput.current?.click()}>
                  <FileJson className="h-3.5 w-3.5" /> Import
                </button>
              </div>
              {saved.length === 0 ? (
                <p className="text-sm text-gray-500">Analyses you make are kept in this browser so you can come back to them.</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {saved.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                      <button type="button" onClick={() => openSaved(e.id)} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-white hover:text-blue-300">{e.name}</div>
                        <div className="text-xs text-gray-500">{e.shots} shots · {Math.round(e.duration)} s · {new Date(e.updatedAt).toLocaleDateString()}</div>
                      </button>
                      <button type="button" aria-label={`Delete ${e.name}`} onClick={() => { deleteSession(e.id); setSaved(listSaved()) }} className="rounded p-1 text-gray-500 hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {step === "mark" && draft && meta && videoUrl && (
        <MarkStep
          meta={meta}
          videoUrl={videoUrl}
          draft={draft}
          setDraft={setDraft}
          onBack={() => setStep(session ? "results" : "upload")}
          onRun={run}
          isRerun={!!session}
        />
      )}

      {step === "processing" && (
        <div className="mx-auto max-w-xl rounded-xl border border-white/10 bg-[var(--card)] p-8 text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-blue-400" />
          <div className="text-lg font-semibold text-white">{progress.stage || "Preparing"}…</div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-blue-500 transition-[width]" style={{ width: `${Math.round(progress.frac * 100)}%` }} />
          </div>
          <div className="mt-2 text-sm tabular-nums text-gray-400">{Math.round(progress.frac * 100)}%</div>
          <p className="mt-4 text-xs text-gray-500">Keep this tab open and visible. A one-minute clip usually takes under a minute on a laptop.</p>
          <button type="button" className={`${btn} mt-4`} onClick={() => abortRef.current?.abort()}>Cancel</button>
        </div>
      )}

      {step === "results" && session && result && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto min-w-0">
              <div className="truncate font-semibold text-white">{session.video.name}</div>
              <div className="text-xs text-gray-500">
                {session.settings.format} · {(session.range.end - session.range.start).toFixed(0)} s analysed
                {!videoUrl && " · video not loaded"}
              </div>
            </div>
            <button type="button" className={btn} onClick={() => fileInput.current?.click()}>
              <FolderOpen className="h-4 w-4" /> {videoUrl ? "New video" : "Select video"}
            </button>
            <button type="button" className={btn} onClick={remark} disabled={!videoUrl} title={videoUrl ? "" : "Select the video first"}>
              <RotateCcw className="h-4 w-4" /> Re-mark court
            </button>
            <button type="button" className={btn} onClick={exportJson}><FileJson className="h-4 w-4" /> Export</button>
            <button type="button" className={btn} onClick={() => { setStep("upload"); setSession(null); setSelectedId(null) }}>Close</button>
          </div>

          {session.warnings.length > 0 && (
            <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {session.warnings.map((w) => (
                <div key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</div>
              ))}
            </div>
          )}

          <SummaryTiles result={result} />

          <div id="review" className="grid scroll-mt-20 gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <VideoReview
                session={session}
                result={result}
                videoUrl={videoUrl}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onEditShot={editShot}
                onAddShot={addShot}
                seekRequest={seekRequest}
              />
            </div>
            <SettingsPanel session={session} update={update} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 space-y-6 lg:col-span-2">
              <PlayersTable result={result} session={session} />
              <ShotTypeChart result={result} session={session} />
            </div>
            <CourtMap result={result} session={session} onShot={goShot} />
          </div>

          <RallyList
            result={result}
            session={session}
            onRally={(r) => { setSeekRequest({ t: r.start - 0.8, n: Date.now() }); setSelectedId(r.shots[0]?.id ?? null) }}
            onToggleWinner={(r) => update((s) => ({ ...s, winners: { ...s.winners, [r.id]: other(r.winner) } }))}
            onShot={goShot}
          />

          <p className="text-xs text-gray-500">
            How it is measured: shots come from the sharp sound of each hit; who hit is worked out from the order of shots and which hits sound louder (the near side is closer to the phone).
            Player positions come from the court marks, so distances are in real metres. Shuttle speed is estimated from the flight time and distance between the two hitters, allowing for air drag;
            treat it as a guide, not a radar reading.
          </p>
        </div>
      )}
    </div>
  )
}

function Steps({ step }: { step: Step }) {
  const items: [Step, string][] = [["upload", "Video"], ["mark", "Court"], ["processing", "Analyse"], ["results", "Review"]]
  const idx = items.findIndex(([s]) => s === step)
  return (
    <ol className="flex items-center gap-1 text-xs">
      {items.map(([s, label], i) => (
        <li key={s} className="flex items-center gap-1">
          {i > 0 && <span className="h-px w-4 bg-white/15" />}
          <span className={`rounded-full px-2.5 py-1 ${i === idx ? "bg-blue-600 text-white" : i < idx ? "bg-white/10 text-gray-200" : "text-gray-500"}`}>
            {i + 1}. {label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function MarkStep({
  meta,
  videoUrl,
  draft,
  setDraft,
  onBack,
  onRun,
  isRerun,
}: {
  meta: VideoMeta
  videoUrl: string
  draft: Draft
  setDraft: (d: Draft) => void
  onBack: () => void
  onRun: () => void
  isRerun: boolean
}) {
  const problems = draft.corners.length === 4 ? validateCorners(draft.corners) : ["Mark all four corners."]
  const len = draft.range.end - draft.range.start
  const tooLong = len > MAX_CLIP_S + 0.01
  const tooShort = len < MIN_CLIP_S
  const setFormat = (format: MatchFormat) =>
    setDraft({ ...draft, settings: { ...draft.settings, format, players: defaultPlayers(format) } })

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        <CourtMarker
          videoUrl={videoUrl}
          width={meta.width}
          height={meta.height}
          corners={draft.corners}
          onChange={(corners) => setDraft({ ...draft, corners })}
          frameTime={draft.frameTime}
        />
        <label className="block text-sm text-gray-400">
          Frame to mark on (pick one where the court lines are easy to see)
          <input
            type="range"
            min={0}
            max={meta.duration}
            step={0.1}
            value={draft.frameTime}
            onChange={(e) => setDraft({ ...draft, frameTime: Number(e.target.value) })}
            className="mt-1 w-full accent-blue-500"
          />
        </label>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-[var(--card)] p-5">
          <h2 className="mb-1 font-semibold text-white">Mark the court</h2>
          <p className="text-sm text-gray-400">
            Put the points on the <span className="text-white">outer corners of the doubles court</span>: 1 far-left, 2 far-right, 3 near-right, 4 near-left.
            The yellow lines should sit on the white court lines. The more exact, the better the player positions.
          </p>
        </div>
        <div className="space-y-4 rounded-xl border border-white/10 bg-[var(--card)] p-5">
          <div>
            <div className="mb-1.5 text-sm text-gray-400">Match</div>
            <div className="flex gap-2">
              {(["singles", "doubles"] as MatchFormat[]).map((f) => (
                <button key={f} type="button" onClick={() => setFormat(f)} className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize ${draft.settings.format === f ? "border-blue-500 bg-blue-500/15 text-white" : "border-white/10 text-gray-400"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <PlayerInputs settings={draft.settings} onChange={(players) => setDraft({ ...draft, settings: { ...draft.settings, players } })} />
          <div>
            <div className="mb-1.5 text-sm text-gray-400">Part of the video to analyse</div>
            <div className="grid grid-cols-2 gap-2">
              {(["start", "end"] as const).map((k) => (
                <label key={k} className="text-xs text-gray-500">
                  {k === "start" ? "From (s)" : "To (s)"}
                  <input
                    type="number"
                    min={0}
                    max={meta.duration}
                    step={0.5}
                    value={Number(draft.range[k].toFixed(1))}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(meta.duration, Number(e.target.value) || 0))
                      setDraft({ ...draft, range: { ...draft.range, [k]: v } })
                    }}
                    className={`${input} mt-1`}
                  />
                </label>
              ))}
            </div>
            <div className={`mt-1 text-xs ${tooLong || tooShort ? "text-amber-300" : "text-gray-500"}`}>
              {len.toFixed(1)} s of {meta.duration.toFixed(1)} s
              {tooLong && ` · at most ${MAX_CLIP_S / 60} minutes at a time`}
              {tooShort && ` · needs at least ${MIN_CLIP_S} s`}
            </div>
          </div>
          <button type="button" className={`${primary} w-full justify-center`} disabled={problems.length > 0 || tooLong || tooShort} onClick={onRun}>
            {isRerun ? "Analyse again" : "Analyse video"}
          </button>
          {isRerun && <p className="text-xs text-gray-500">Your shot edits and rally winners are kept.</p>}
          <button type="button" className={`${btn} w-full justify-center`} onClick={onBack}>Back</button>
        </div>
      </div>
    </div>
  )
}

function PlayerInputs({ settings, onChange }: { settings: AnalysisSettings; onChange: (p: AnalysisSettings["players"]) => void }) {
  return (
    <div className="space-y-2">
      {(["far", "near"] as Side[]).map((side) => (
        <div key={side}>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-400">
            <span className="h-2 w-2 rounded-full" style={{ background: SIDE_COLORS[side] }} />
            {side === "far" ? "Far side (top of the picture)" : "Near side (closest to the camera)"}
          </div>
          {settings.players[side].map((p, i) => (
            <div key={i} className="mb-1.5 grid grid-cols-[1fr_88px] gap-2">
              <input
                value={p.name}
                aria-label={`${side} player ${i + 1} name`}
                onChange={(e) => onChange({ ...settings.players, [side]: settings.players[side].map((q, k) => (k === i ? { ...q, name: e.target.value } : q)) })}
                className={input}
              />
              <label className="relative">
                <input
                  type="number"
                  min={20}
                  max={200}
                  value={p.weightKg}
                  aria-label={`${side} player ${i + 1} weight in kg`}
                  onChange={(e) => onChange({ ...settings.players, [side]: settings.players[side].map((q, k) => (k === i ? { ...q, weightKg: Number(e.target.value) || 65 } : q)) })}
                  className={`${input} pr-7`}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">kg</span>
              </label>
            </div>
          ))}
        </div>
      ))}
      <p className="text-xs text-gray-500">Weight is only used to estimate calories.</p>
    </div>
  )
}

function SettingsPanel({ session, update }: { session: Session; update: (fn: (s: Session) => Session) => void }) {
  const s = session.settings
  const set = (patch: Partial<AnalysisSettings>) => update((x) => ({ ...x, settings: { ...x.settings, ...patch } }))
  const countAt = (db: number) => session.onsets.filter((o) => o.rise >= db && o.t >= session.range.start && o.t <= session.range.end).length
  const removed = Object.values(session.edits).filter((e) => e.deleted).length
  return (
    <div className="space-y-5 rounded-xl border border-white/10 bg-[var(--card)] p-5">
      <h3 className="font-semibold text-white">Settings</h3>
      <PlayerInputs settings={s} onChange={(players) => set({ players })} />
      {session.hasAudio && (
        <label className="block">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Shot sensitivity</span>
            <span className="tabular-nums text-gray-300">{countAt(s.sensitivityDb)} sounds</span>
          </div>
          <input
            type="range"
            min={MIN_CANDIDATE_RISE_DB}
            max={30}
            step={0.5}
            value={30 + MIN_CANDIDATE_RISE_DB - s.sensitivityDb}
            onChange={(e) => set({ sensitivityDb: 30 + MIN_CANDIDATE_RISE_DB - Number(e.target.value) })}
            className="mt-1 w-full accent-blue-500"
            aria-label="Shot sensitivity"
          />
          <div className="flex justify-between text-xs text-gray-500"><span>Fewer (strict)</span><span>More (picks up quiet hits)</span></div>
        </label>
      )}
      <label className="block">
        <div className="flex justify-between text-sm text-gray-400">
          <span>Pause that ends a rally</span>
          <span className="tabular-nums text-gray-300">{s.rallyGapS.toFixed(1)} s</span>
        </div>
        <input type="range" min={1.5} max={8} step={0.5} value={s.rallyGapS} onChange={(e) => set({ rallyGapS: Number(e.target.value) })} className="mt-1 w-full accent-blue-500" aria-label="Pause that ends a rally" />
      </label>
      <div>
        <div className="mb-1.5 text-sm text-gray-400">First serve of the clip</div>
        <div className="flex gap-2">
          {(["near", "far"] as Side[]).map((side) => (
            <button key={side} type="button" onClick={() => set({ firstServer: side })} className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${s.firstServer === side ? "text-white" : "border-white/10 text-gray-400"}`} style={s.firstServer === side ? { borderColor: SIDE_COLORS[side], background: SIDE_COLORS[side] + "26" } : undefined}>
              {side === "near" ? "Near side" : "Far side"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">Used when the sound does not make it clear who served.</p>
      </div>
      {(removed > 0 || session.manualShots.length > 0 || Object.keys(session.winners).length > 0) && (
        <button
          type="button"
          className={`${btn} w-full justify-center`}
          onClick={() => { if (confirm("Undo all your shot edits, added shots and rally winners?")) update((x) => ({ ...x, edits: {}, manualShots: [], winners: {} })) }}
        >
          <RotateCcw className="h-4 w-4" /> Reset my edits{removed ? ` (${removed} removed)` : ""}
        </button>
      )}
      <div className="text-xs text-gray-500">
        Players found in {Math.round(session.detection.near * 100)}% (near) and {Math.round(session.detection.far * 100)}% (far) of frames.
      </div>
    </div>
  )
}
