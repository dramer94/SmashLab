"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, ChevronDown, GraduationCap, PlayCircle, Target } from "lucide-react"
import { coachReport, type CoachTip } from "@/lib/analysis/coach"
import { SIDE_COLORS } from "@/lib/analysis/overlay"
import type { AnalysisResult, Session, Side } from "@/lib/analysis/types"

const card = "rounded-xl border border-white/10 bg-[var(--card)] p-4 sm:p-5"

function Tip({ tip, onSeek }: { tip: CoachTip; onSeek?: (t: number) => void }) {
  const [open, setOpen] = useState(false)
  const good = tip.kind === "strength"
  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-start gap-2">
        {good ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" /> : <Target className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-white">{tip.title}</div>
          <p className="mt-0.5 text-sm text-gray-300">{tip.evidence}</p>
          <p className="mt-1 text-sm text-gray-400">{tip.why}</p>
          {tip.drill && (
            <button type="button" onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300" aria-expanded={open}>
              Drill to try <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
          {open && tip.drill && <p className="mt-1 rounded-md bg-blue-500/10 px-3 py-2 text-sm text-blue-100">{tip.drill}</p>}
          {onSeek && tip.moments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tip.moments.map((m) => (
                <button
                  key={m.t}
                  type="button"
                  onClick={() => onSeek(m.t)}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-xs text-gray-200 hover:bg-white/5"
                >
                  <PlayCircle className="h-3.5 w-3.5" /> {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/** Pick any player and get strengths, things to work on and drills from this video. */
export function CoachPanel({ session, result, onSeek }: { session: Session; result: AnalysisResult; onSeek?: (t: number) => void }) {
  const players = (["near", "far"] as Side[]).flatMap((side) => session.settings.players[side].map((p, slot) => ({ side, slot, name: p.name })))
  const [pick, setPick] = useState<{ side: Side; slot: number }>(session.me ?? { side: players[0].side, slot: players[0].slot })
  const report = useMemo(() => coachReport(session, result, pick.side, pick.slot), [session, result, pick])

  return (
    <div className={card}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <GraduationCap className="h-5 w-5 text-blue-400" />
        <h3 className="mr-auto font-semibold text-white">Coach</h3>
        <span className="text-xs text-gray-500">Advice for</span>
        {players.map((p) => {
          const on = pick.side === p.side && pick.slot === p.slot
          return (
            <button
              key={`${p.side}${p.slot}`}
              type="button"
              onClick={() => setPick({ side: p.side, slot: p.slot })}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${on ? "border-blue-500 bg-blue-500/15 text-white" : "border-white/10 text-gray-400 hover:text-gray-200"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: SIDE_COLORS[p.side] }} />
              {p.name}
            </button>
          )
        })}
      </div>

      <p className="mb-4 text-base text-white">{report.summary}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-300">Work on</h4>
          {report.improve.length ? (
            <ul className="space-y-2">{report.improve.map((t) => <Tip key={t.title} tip={t} onSeek={onSeek} />)}</ul>
          ) : (
            <p className="text-sm text-gray-500">Nothing stood out in this clip compared with the others on court.</p>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-green-400">Strengths</h4>
          {report.strengths.length ? (
            <ul className="space-y-2">{report.strengths.map((t) => <Tip key={t.title} tip={t} onSeek={onSeek} />)}</ul>
          ) : (
            <p className="text-sm text-gray-500">No clear strength showed up in this clip yet.</p>
          )}
        </div>
      </div>

      {report.numbers.length > 0 && (
        <div className="mt-5 border-t border-white/5 pt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">The numbers behind it</h4>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {report.numbers.map((n) => (
              <div key={n.label} className="flex justify-between gap-3 border-b border-white/5 py-1">
                <dt className="text-gray-400">{n.label}</dt>
                <dd className="text-right tabular-nums text-gray-200">{n.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-gray-500">
        {report.caveats.map((c) => <li key={c}>{c}</li>)}
      </ul>
    </div>
  )
}
