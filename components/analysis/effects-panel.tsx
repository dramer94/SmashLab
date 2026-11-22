"use client"

import { useRef, useState } from "react"
import { ChevronDown, ImagePlus, Sparkles, X } from "lucide-react"
import { HUD_THEMES, logoToDataUrl, THEMES, type Brand, type Effects } from "@/lib/analysis/effects"
import type { Session, Side } from "@/lib/analysis/types"

const row = "flex flex-wrap items-center gap-2"
const label = "w-28 shrink-0 text-xs text-gray-400"
const chip = (on: boolean) =>
  `rounded-md border px-2.5 py-1 text-xs ${on ? "border-blue-500 bg-blue-500/15 text-white" : "border-white/10 text-gray-400 hover:text-gray-200"}`

/** Settings for the look of the recorded video; every change shows in the player straight away. */
export function EffectsPanel({
  session,
  effects,
  onChange,
  brand,
  onBrand,
}: {
  session: Session
  effects: Effects
  onChange: (e: Effects) => void
  brand: Brand
  onBrand: (b: Brand) => void
}) {
  const [open, setOpen] = useState(true)
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Effects>) => onChange({ ...effects, ...patch })
  const players = (["near", "far"] as Side[]).flatMap((side) =>
    session.settings.players[side].map((p, slot) => ({ side, slot, name: p.name }))
  )
  const focusKey = effects.focus ? `${effects.focus.side}:${effects.focus.slot}` : ""

  return (
    <div className="rounded-xl border border-white/10 bg-[var(--card)]">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
        <Sparkles className="h-4 w-4 text-blue-400" />
        <span className="font-semibold text-white">Video effects</span>
        <span className="text-xs text-gray-500">theme, logo, focus, sounds, replays, end card</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-white/5 px-4 py-4">
          <div className={row}>
            <span className={label}>HUD theme</span>
            {HUD_THEMES.map((th) => (
              <button key={th} type="button" onClick={() => set({ theme: th })} className={chip(effects.theme === th)}>
                {THEMES[th].label}
              </button>
            ))}
          </div>
          <div className={row}>
            <span className={label}>Team colours</span>
            {(["near", "far"] as Side[]).map((side) => (
              <label key={side} className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                <input
                  type="color"
                  value={effects.colors[side]}
                  onChange={(e) => set({ colors: { ...effects.colors, [side]: e.target.value } })}
                  className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-transparent"
                  aria-label={`${side} side colour`}
                />
                {side}
              </label>
            ))}
          </div>
          <div className={row}>
            <span className={label}>HUD</span>
            <label className="flex min-w-[140px] flex-1 items-center gap-2 text-xs text-gray-400">
              See-through
              <input type="range" min={0.2} max={1} step={0.05} value={1.2 - effects.opacity} onChange={(e) => set({ opacity: 1.2 - Number(e.target.value) })} className="flex-1 accent-blue-500" aria-label="HUD transparency" />
            </label>
            <label className="flex min-w-[140px] flex-1 items-center gap-2 text-xs text-gray-400">
              Size
              <input type="range" min={0.7} max={1.5} step={0.05} value={effects.size} onChange={(e) => set({ size: Number(e.target.value) })} className="flex-1 accent-blue-500" aria-label="HUD size" />
            </label>
          </div>
          <div className={row}>
            <span className={label}>Your logo & text</span>
            <input
              value={brand.text}
              onChange={(e) => onBrand({ ...brand, text: e.target.value.slice(0, 40) })}
              placeholder="e.g. club name"
              className="min-w-[150px] flex-1 rounded-md border border-white/10 bg-[var(--background)] px-2.5 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              aria-label="Text shown on the video"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ""
                if (!f) return
                try {
                  setLogoError(null)
                  onBrand({ ...brand, logo: await logoToDataUrl(f) })
                } catch (err) {
                  setLogoError((err as Error).message)
                }
              }}
            />
            {brand.logo ? (
              <span className="inline-flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.logo} alt="Your logo" className="h-8 w-auto rounded bg-white/10" />
                <button type="button" onClick={() => onBrand({ ...brand, logo: null })} className="rounded p-1 text-gray-400 hover:text-red-300" aria-label="Remove logo">
                  <X className="h-4 w-4" />
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/5">
                <ImagePlus className="h-4 w-4" /> Logo
              </button>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <input type="checkbox" checked={effects.showBrand} onChange={(e) => set({ showBrand: e.target.checked })} className="accent-blue-500" /> Show
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <input type="checkbox" checked={effects.watermark} onChange={(e) => set({ watermark: e.target.checked })} className="accent-blue-500" /> SmashLab mark
            </label>
            {logoError && <span className="text-xs text-amber-300">{logoError}</span>}
          </div>
          <div className={row}>
            <span className={label}>Focus on a player</span>
            <select
              value={focusKey}
              onChange={(e) => {
                const v = e.target.value
                if (!v) return set({ focus: null })
                const [side, slot] = v.split(":")
                set({ focus: { side: side as Side, slot: Number(slot) } })
              }}
              className="rounded-md border border-white/10 bg-[var(--background)] px-2 py-1.5 text-sm text-white"
              aria-label="Player to follow"
            >
              <option value="">Off: show the whole court</option>
              {players.map((p) => (
                <option key={`${p.side}:${p.slot}`} value={`${p.side}:${p.slot}`}>
                  Follow {p.name} ({p.side})
                </option>
              ))}
            </select>
            {effects.focus && (
              <label className="flex min-w-[140px] flex-1 items-center gap-2 text-xs text-gray-400">
                Zoom {effects.focusZoom.toFixed(1)}×
                <input type="range" min={1.3} max={2.6} step={0.1} value={effects.focusZoom} onChange={(e) => set({ focusZoom: Number(e.target.value) })} className="flex-1 accent-blue-500" aria-label="Focus zoom" />
              </label>
            )}
          </div>
          <div className={row}>
            <span className={label}>Sound</span>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
              <input type="checkbox" checked={effects.hitSound} onChange={(e) => set({ hitSound: e.target.checked })} className="accent-blue-500" /> Hit sound on every shot
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
              <input type="checkbox" checked={effects.crowdSound} onChange={(e) => set({ crowdSound: e.target.checked })} className="accent-blue-500" /> Crowd after each rally
            </label>
          </div>
          <div className={row}>
            <span className={label}>Replays & ending</span>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
              <input type="checkbox" checked={effects.autoReplay} onChange={(e) => set({ autoReplay: e.target.checked })} className="accent-blue-500" /> Pick best shots for slow-mo replays
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
              <input type="checkbox" checked={effects.endCard} onChange={(e) => set({ endCard: e.target.checked })} className="accent-blue-500" /> End card with awards (5 s)
            </label>
          </div>
          <p className="text-xs text-gray-500">
            Changes show in the player above as you make them. Your text and logo are remembered in this browser for your next videos.
          </p>
        </div>
      )}
    </div>
  )
}
