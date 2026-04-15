import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { getFlag } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Thomas / Uber / Sudirman Cup History | SmashLab',
  description: 'Historical Thomas, Uber, and Sudirman Cup results with country team-strength scores computed from match data.',
}

const FINISH_RANK: Record<string, number> = {
  CHAMPION: 1, RUNNER_UP: 2, SEMI_FINAL: 3, QUARTER_FINAL: 4, GROUP_STAGE: 5, DID_NOT_QUALIFY: 6,
}
const FINISH_LABEL: Record<string, string> = {
  CHAMPION: '🏆 Champion',
  RUNNER_UP: '🥈 Runner-up',
  SEMI_FINAL: 'Semi-final',
  QUARTER_FINAL: 'Quarter-final',
  GROUP_STAGE: 'Group stage',
  DID_NOT_QUALIFY: 'DNQ',
}
const FINISH_COLOR: Record<string, string> = {
  CHAMPION: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  RUNNER_UP: 'bg-slate-100 text-slate-700 border-slate-300',
  SEMI_FINAL: 'bg-amber-50 text-amber-700 border-amber-200',
  QUARTER_FINAL: 'bg-slate-50 text-slate-600 border-slate-200',
  GROUP_STAGE: 'bg-slate-50 text-slate-500 border-slate-200',
}

function eventTitle(type: string) {
  return type === 'THOMAS' ? 'Thomas Cup' : type === 'UBER' ? 'Uber Cup' : 'Sudirman Cup'
}

export default async function TeamCupsPage() {
  const events = await prisma.slTeamEvent.findMany({
    include: {
      results: { orderBy: [{ finish: 'asc' }, { teamScore: 'desc' }] },
    },
    orderBy: [{ year: 'desc' }, { type: 'asc' }],
  })

  const byYear = new Map<number, typeof events>()
  for (const ev of events) {
    if (!byYear.has(ev.year)) byYear.set(ev.year, [])
    byYear.get(ev.year)!.push(ev)
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a)

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mb-2">
            Team Cup History
          </h1>
          <p className="text-slate-600 text-sm sm:text-base max-w-3xl">
            Thomas Cup (men), Uber Cup (women), and Sudirman Cup (mixed). Each
            row shows a country&apos;s <strong>actual finish</strong> and a{' '}
            <strong>team strength score</strong> computed from their top
            players&apos; match wins in the 12 months before the event. A
            country whose score is much higher than their finish usually
            under-performed that year; the reverse is an over-performance.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Score formula: top N players per squad slot, summed over wins
            weighted by round (Final=3.0, SF=2.5, QF=2.2, R16=2.0, Group=1.6).
          </p>
        </header>

        <div className="space-y-10">
          {years.map(year => (
            <section key={year} className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 border-b border-slate-200 pb-1">
                {year}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {byYear.get(year)!.map(ev => {
                  const sorted = [...ev.results].sort((a, b) => {
                    const rf = (FINISH_RANK[a.finish] ?? 99) - (FINISH_RANK[b.finish] ?? 99)
                    if (rf !== 0) return rf
                    return (b.teamScore ?? 0) - (a.teamScore ?? 0)
                  })
                  return (
                    <div key={ev.id} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                      <div className="bg-slate-900 text-white px-4 py-2">
                        <div className="font-bold text-sm">{eventTitle(ev.type)}</div>
                        {ev.host && (
                          <div className="text-xs text-slate-300">Host: {ev.host}</div>
                        )}
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {sorted.map(r => (
                          <li key={r.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-lg leading-none flex-shrink-0">{getFlag(r.country)}</span>
                              <span className="font-semibold text-slate-800">{r.country}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {typeof r.teamScore === 'number' && (
                                <span className="text-xs font-mono text-slate-500 tabular-nums">
                                  {r.teamScore.toFixed(0)}
                                </span>
                              )}
                              <span className={`text-[10px] font-bold uppercase tracking-wide border rounded px-1.5 py-0.5 ${FINISH_COLOR[r.finish] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                {FINISH_LABEL[r.finish] || r.finish}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 text-xs text-slate-500 space-y-1">
          <p>
            Actual finishes hand-entered from BWF official archives. Team scores
            are recomputed from sl_match data whenever{' '}
            <code>scripts/compute-team-scores.ts</code> runs.
          </p>
          <p>
            <Link href="/" className="underline hover:text-slate-700">← Back to SmashLab</Link>
          </p>
        </footer>
      </div>
    </main>
  )
}
