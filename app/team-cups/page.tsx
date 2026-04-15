import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { getFlag } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Thomas / Uber / Sudirman Cup History | SmashLab',
  description: 'Historical Thomas, Uber, and Sudirman Cup results with country team-strength scores computed from match data.',
}

const TYPES = ['THOMAS', 'UBER', 'SUDIRMAN'] as const
type EventType = typeof TYPES[number]

const TYPE_LABEL: Record<string, string> = {
  THOMAS: 'Thomas Cup',
  UBER: 'Uber Cup',
  SUDIRMAN: 'Sudirman Cup',
}
const TYPE_SUB: Record<string, string> = {
  THOMAS: "Men's team",
  UBER: "Women's team",
  SUDIRMAN: 'Mixed team',
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
  CHAMPION: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  RUNNER_UP: 'bg-slate-200 text-slate-800 border-slate-300',
  SEMI_FINAL: 'bg-amber-50 text-amber-800 border-amber-200',
  QUARTER_FINAL: 'bg-slate-50 text-slate-700 border-slate-200',
  GROUP_STAGE: 'bg-slate-50 text-slate-500 border-slate-200',
}

export default async function TeamCupsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; year?: string }>
}) {
  const sp = await searchParams
  const type = (TYPES.includes(sp.type as EventType) ? sp.type : 'THOMAS') as EventType

  // All editions of every type so we can build selectors.
  const allEditions = await prisma.slTeamEvent.findMany({
    select: { id: true, type: true, year: true },
    orderBy: [{ year: 'desc' }, { type: 'asc' }],
  })

  const yearsForType = allEditions.filter(e => e.type === type).map(e => e.year)
  const defaultYear = yearsForType[0]?.toString() || ''
  const yearParam = sp.year && yearsForType.includes(parseInt(sp.year)) ? sp.year : defaultYear
  const selectedYear = parseInt(yearParam)

  const event = await prisma.slTeamEvent.findFirst({
    where: { type, year: selectedYear },
    include: {
      results: true,
    },
  })

  const results = (event?.results ?? []).slice().sort((a, b) => {
    const rf = (FINISH_RANK[a.finish] ?? 99) - (FINISH_RANK[b.finish] ?? 99)
    if (rf !== 0) return rf
    return (b.teamScore ?? 0) - (a.teamScore ?? 0)
  })

  // Trend data for Malaysia + a few benchmark countries across all years of
  // the selected type.
  const benchmarkCountries = ['MAS', 'CHN', 'INA', 'JPN', 'DEN', 'KOR']
  const trend = await prisma.slTeamEventResult.findMany({
    where: {
      TeamEvent: { type },
      country: { in: benchmarkCountries },
    },
    include: { TeamEvent: { select: { year: true } } },
    orderBy: { TeamEvent: { year: 'asc' } },
  })

  type TrendPoint = { year: number; score: number; finish: string }
  const trendByCountry = new Map<string, TrendPoint[]>()
  for (const r of trend) {
    if (!trendByCountry.has(r.country)) trendByCountry.set(r.country, [])
    trendByCountry.get(r.country)!.push({
      year: r.TeamEvent.year,
      score: r.teamScore ?? 0,
      finish: r.finish,
    })
  }

  // Build a tiny inline SVG line chart for each country.
  const allYears = Array.from(new Set(trend.map(r => r.TeamEvent.year))).sort((a, b) => a - b)
  const allScores = trend.map(r => r.teamScore ?? 0)
  const maxScore = Math.max(1, ...allScores)
  const chartW = 600
  const chartH = 220
  const pad = 28
  const xFor = (year: number) => {
    if (allYears.length < 2) return pad
    const i = allYears.indexOf(year)
    return pad + (i / (allYears.length - 1)) * (chartW - pad * 2)
  }
  const yFor = (s: number) => chartH - pad - (s / maxScore) * (chartH - pad * 2)

  // Correlation across all years (actual finish numeric vs team score, for
  // the selected type — lower finishRank = better actual result).
  const corrRows = await prisma.slTeamEventResult.findMany({
    where: { TeamEvent: { type }, teamScore: { not: null } },
    select: { teamScore: true, finish: true },
  })
  const corr = pearson(
    corrRows.map(r => r.teamScore as number),
    corrRows.map(r => -(FINISH_RANK[r.finish] ?? 6)) // negate so higher=better
  )

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <header className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mb-1">
            Team Cup History
          </h1>
          <p className="text-slate-600 text-sm max-w-3xl">
            Thomas, Uber, and Sudirman Cup — each country&apos;s actual finish
            alongside a computed team-strength score based on their top
            players&apos; wins in the 12 months before the event.
          </p>
        </header>

        {/* Type tabs */}
        <div className="flex flex-wrap gap-2 mb-3">
          {TYPES.map(t => (
            <Link
              key={t}
              href={`/team-cups?type=${t}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold border ${
                t === type
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {TYPE_LABEL[t]} <span className="opacity-60 font-normal">· {TYPE_SUB[t]}</span>
            </Link>
          ))}
        </div>

        {/* Year chips */}
        <div className="flex flex-wrap gap-1.5 mb-6">
          {yearsForType.map(y => (
            <Link
              key={y}
              href={`/team-cups?type=${type}&year=${y}`}
              className={`rounded px-2.5 py-1 text-xs font-mono tabular-nums border ${
                y === selectedYear
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>

        {/* Selected event table */}
        {event ? (
          <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-8">
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-bold">{TYPE_LABEL[type]} {selectedYear}</div>
                <div className="text-xs text-slate-300">
                  {TYPE_SUB[type]}
                  {event.host ? ` · Hosted in ${event.host}` : ''}
                </div>
              </div>
              <div className="text-xs text-slate-300">{results.length} countries on record</div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">#</th>
                  <th className="text-left px-4 py-2">Country</th>
                  <th className="text-left px-4 py-2">Actual finish</th>
                  <th className="text-right px-4 py-2">Strength score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-400 font-mono">{i + 1}</td>
                    <td className="px-4 py-2">
                      <span className="mr-1.5">{getFlag(r.country)}</span>
                      <span className="font-semibold text-slate-800">{r.country}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wide border rounded px-1.5 py-0.5 ${FINISH_COLOR[r.finish] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {FINISH_LABEL[r.finish] || r.finish}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700">
                      {r.teamScore == null ? <span className="text-slate-400">pending…</span> : r.teamScore.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-slate-500 text-sm">
            No data for this edition yet.
          </div>
        )}

        {/* Trend chart */}
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 mb-8">
          <h2 className="font-bold text-slate-800 mb-1">
            Strength trend: {TYPE_LABEL[type]}
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Team strength over time for the top traditional powers. Higher = deeper talent pool based on match wins in the 12 months before each edition.
          </p>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-56">
            {/* axes */}
            <line x1={pad} y1={chartH - pad} x2={chartW - pad} y2={chartH - pad} stroke="#cbd5e1" />
            <line x1={pad} y1={pad} x2={pad} y2={chartH - pad} stroke="#cbd5e1" />
            {allYears.map((y, i) => (
              (i === 0 || i === allYears.length - 1 || i % 4 === 0) ? (
                <text key={y} x={xFor(y)} y={chartH - pad + 14} textAnchor="middle" fontSize="9" fill="#64748b">{y}</text>
              ) : null
            ))}
            {[0.25, 0.5, 0.75, 1].map(f => (
              <g key={f}>
                <line x1={pad} y1={yFor(maxScore * f)} x2={chartW - pad} y2={yFor(maxScore * f)} stroke="#f1f5f9" />
                <text x={pad - 4} y={yFor(maxScore * f) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(maxScore * f)}</text>
              </g>
            ))}
            {/* lines */}
            {Array.from(trendByCountry.entries()).map(([country, pts], ci) => {
              const colour = ['#2563eb', '#dc2626', '#16a34a', '#ea580c', '#7c3aed', '#0891b2'][ci % 6]
              const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.year).toFixed(1)} ${yFor(p.score).toFixed(1)}`).join(' ')
              return (
                <g key={country}>
                  <path d={d} stroke={colour} strokeWidth="1.6" fill="none" />
                  {pts.map(p => (
                    <circle key={p.year} cx={xFor(p.year)} cy={yFor(p.score)} r="2.2" fill={colour}>
                      <title>{country} {p.year}: {p.score.toFixed(0)} ({p.finish})</title>
                    </circle>
                  ))}
                </g>
              )
            })}
          </svg>
          <div className="flex flex-wrap gap-3 mt-2 text-xs">
            {Array.from(trendByCountry.keys()).map((country, ci) => {
              const colour = ['#2563eb', '#dc2626', '#16a34a', '#ea580c', '#7c3aed', '#0891b2'][ci % 6]
              return (
                <span key={country} className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: colour }} />
                  <span className="font-semibold text-slate-700">{country}</span>
                </span>
              )
            })}
          </div>
        </section>

        {/* Correlation summary */}
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 mb-8">
          <h2 className="font-bold text-slate-800 mb-1">How predictive is the score?</h2>
          <p className="text-sm text-slate-600">
            Across all {TYPE_LABEL[type]} editions on record, the correlation
            between a country&apos;s team-strength score and how deep they got
            is{' '}
            <span className="font-mono font-bold text-slate-900">
              r = {isFinite(corr) ? corr.toFixed(2) : '—'}
            </span>
            . 1.0 = perfect; 0 = no relationship; -1.0 = inverted.
          </p>
        </section>

        <footer className="text-xs text-slate-500 space-y-1">
          <p>
            Finishes hand-entered from BWF archives. Scores computed from the
            sl_match table using <code>scripts/compute-team-scores.ts</code>.
          </p>
          <p>
            <Link href="/" className="underline hover:text-slate-700">← Back to SmashLab</Link>
          </p>
        </footer>
      </div>
    </main>
  )
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return NaN
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]
    sxx += xs[i] * xs[i]; syy += ys[i] * ys[i]
    sxy += xs[i] * ys[i]
  }
  const num = n * sxy - sx * sy
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  if (den === 0) return NaN
  return num / den
}
