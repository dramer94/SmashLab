import type { Session, VideoMeta } from "./types"

const PREFIX = "smashlab.analysis."
const INDEX = "smashlab.analysis.index"

export interface SavedEntry {
  id: string
  name: string
  updatedAt: number
  duration: number
  shots: number
}

export function videoKey(v: Pick<VideoMeta, "name" | "size" | "lastModified">) {
  return `${v.name}|${v.size}|${v.lastModified}`
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function listSaved(): SavedEntry[] {
  return safe(() => JSON.parse(localStorage.getItem(INDEX) || "[]") as SavedEntry[], [])
}

export function loadSession(id: string): Session | null {
  return safe(() => {
    const raw = localStorage.getItem(PREFIX + id)
    return raw ? (JSON.parse(raw) as Session) : null
  }, null)
}

export function saveSession(s: Session, shots: number): boolean {
  return safe(() => {
    localStorage.setItem(PREFIX + s.id, JSON.stringify(s))
    const list = listSaved().filter((e) => e.id !== s.id)
    list.unshift({ id: s.id, name: s.video.name, updatedAt: s.updatedAt, duration: s.range.end - s.range.start, shots })
    // Keep the 12 most recent analyses; drop older ones to stay within storage limits.
    for (const old of list.splice(12)) localStorage.removeItem(PREFIX + old.id)
    localStorage.setItem(INDEX, JSON.stringify(list))
    return true
  }, false)
}

export function deleteSession(id: string) {
  safe(() => {
    localStorage.removeItem(PREFIX + id)
    localStorage.setItem(INDEX, JSON.stringify(listSaved().filter((e) => e.id !== id)))
  }, undefined)
}

export function isSession(x: unknown): x is Session {
  const s = x as Session
  return !!s && s.version === 1 && Array.isArray(s.corners) && Array.isArray(s.onsets) && !!s.video && !!s.settings
}
