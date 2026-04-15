import { Metadata } from "next"
import Link from "next/link"
import {
  getOlympicMedalTable,
  getOlympicYears,
  getOlympicMedals,
  getOlympicMatches,
} from "@/lib/queries"
import { getFlag } from "@/lib/utils"

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Olympic Badminton History",
  description: "Complete Olympic badminton results from 1992 Barcelona to 2024 Paris — every match, every medal, every champion.",
}

const DISCIPLINES = ['MS', 'WS', 'MD', 'WD', 'XD']
const DISC_LABELS: Record<string, string> = {
  MS: "Men's Singles", WS: "Women's Singles",
  MD: "Men's Doubles", WD: "Women's Doubles", XD: "Mixed Doubles",
}
const ROUND_ORDER = ['Group', 'R1', 'R32', 'R16', 'QF', 'SF', 'Bronze', 'F']
const ROUND_LABELS: Record<string, string> = {
  Group: 'Group Stage', R1: 'Round 1', R32: 'Round of 32', R16: 'Round of 16',
  QF: 'Quarterfinals', SF: 'Semifinals', Bronze: 'Bronze Medal Match', F: 'Final',
}
const MEDAL_EMOJI: Record<string, string> = { Gold: '🥇', Silver: '🥈', Bronze: '🥉' }

interface PageProps {
  searchParams: Promise<{ year?: string; discipline?: string }>
}

export default async function OlympicsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const selectedYear = params.year ? parseInt(params.year) : null
  const selectedDisc = params.discipline ?? 'MS'

  const [medalTable, years] = await Promise.all([
    getOlympicMedalTable(),
    getOlympicYears(),
  ])

  const hasData = years.length > 0
  const defaultYear = years[0]?.year ?? 2024

  const [medals, matches] = hasData
    ? await Promise.all([
        getOlympicMedals(selectedYear ?? defaultYear, selectedDisc),
        selectedYear ? getOlympicMatches(selectedYear ?? defaultYear, selectedDisc) : Promise.resolve([]),
      ])
    : [[], []]

  // Group matches by round
  const matchesByRound = new Map<string, typeof matches>()
  for (const m of matches) {
    const arr = matchesByRound.get(m.round) ?? []
    arr.push(m)
    matchesByRound.set(m.round, arr)
  }
  const roundOrder = ROUND_ORDER.filter(r => matchesByRound.has(r))

  const topMAS = medalTable.find(r => r.noc === 'MAS')
  const topINA = medalTable.find(r => r.noc === 'INA')
  const topCHN = medalTable.find(r => r.noc === 'CHN')

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Olympic Badminton</h1>
        <p className="text-gray-400 mt-1">
          Complete results from 1992 Barcelona through 2024 Paris · Source:{" "}
          <a href="https://www.olympedia.org" target="_blank" rel="noopener noreferrer"
            className="text-blue-400 hover:underline">olympedia.org</a>
        </p>
      </div>

      {!hasData ? (
        <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
          <div className="text-4xl mb-4">🏸</div>
          <h2 className="text-xl font-bold text-white mb-2">Data loading...</h2>
          <p className="text-gray-400">Run <code className="bg-white/10 px-2 py-0.5 rounded text-sm">node --experimental-strip-types scripts/scrape-olympics.ts</code> to populate Olympic data.</p>
        </div>
      ) : (
        <>
          {/* Medal table summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            {/* All-time medal table */}
            <div className="lg:col-span-2">
              <h2 className="text-lg font-bold text-white mb-4">All-Time Medal Table</h2>
              <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-2.5 text-left text-xs text-gray-400">#</th>
                      <th className="px-4 py-2.5 text-left text-xs text-gray-400">Country</th>
                      <th className="px-4 py-2.5 text-center text-xs text-yellow-400">🥇</th>
                      <th className="px-4 py-2.5 text-center text-xs text-gray-300">🥈</th>
                      <th className="px-4 py-2.5 text-center text-xs text-orange-400">🥉</th>
                      <th className="px-4 py-2.5 text-center text-xs text-gray-400">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {medalTable.slice(0, 20).map((row, i) => (
                      <tr key={row.noc}
                        className={`hover:bg-white/5 transition-colors ${i < 3 ? 'bg-white/3' : ''}`}>
                        <td className="px-4 py-2 text-xs text-gray-600">{i + 1}</td>
                        <td className="px-4 py-2">
                          <Link href={`/players?country=${row.noc}`} className="flex items-center gap-2 hover:text-blue-400 transition-colors">
                            <span>{getFlag(row.noc)}</span>
                            <span className="text-sm font-medium text-white">{row.noc}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-center text-sm font-bold text-yellow-400">{row.gold || '—'}</td>
                        <td className="px-4 py-2 text-center text-sm font-bold text-gray-300">{row.silver || '—'}</td>
                        <td className="px-4 py-2 text-center text-sm font-bold text-orange-400">{row.bronze || '—'}</td>
                        <td className="px-4 py-2 text-center text-sm font-semibold text-blue-400">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Key stats */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Key Stats</h2>
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Olympic editions</span>
                  <span className="text-sm font-bold text-white">{years.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Nations with medals</span>
                  <span className="text-sm font-bold text-white">{medalTable.filter(r => r.total > 0).length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Nations with gold</span>
                  <span className="text-sm font-bold text-yellow-400">{medalTable.filter(r => r.gold > 0).length}</span>
                </div>
                {topCHN && (
                  <div className="pt-2 border-t border-white/10">
                    <div className="text-xs text-gray-500 mb-1">Dominant nation (China)</div>
                    <div className="flex gap-3">
                      <span className="text-sm text-yellow-400 font-bold">{topCHN.gold}🥇</span>
                      <span className="text-sm text-gray-300 font-bold">{topCHN.silver}🥈</span>
                      <span className="text-sm text-orange-400 font-bold">{topCHN.bronze}🥉</span>
                    </div>
                  </div>
                )}
                {topMAS && (
                  <div className="pt-2 border-t border-white/10">
                    <div className="text-xs text-gray-500 mb-1">{getFlag('MAS')} Malaysia</div>
                    <div className="flex gap-3">
                      <span className="text-sm text-yellow-400 font-bold">{topMAS.gold || 0}🥇</span>
                      <span className="text-sm text-gray-300 font-bold">{topMAS.silver || 0}🥈</span>
                      <span className="text-sm text-orange-400 font-bold">{topMAS.bronze || 0}🥉</span>
                    </div>
                  </div>
                )}
                {topINA && (
                  <div className="pt-2 border-t border-white/10">
                    <div className="text-xs text-gray-500 mb-1">{getFlag('INA')} Indonesia</div>
                    <div className="flex gap-3">
                      <span className="text-sm text-yellow-400 font-bold">{topINA.gold}🥇</span>
                      <span className="text-sm text-gray-300 font-bold">{topINA.silver}🥈</span>
                      <span className="text-sm text-orange-400 font-bold">{topINA.bronze}🥉</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Year selector */}
              <h2 className="text-lg font-bold text-white pt-2">Browse by Games</h2>
              <div className="flex flex-wrap gap-2">
                {years.map(y => (
                  <Link key={y.year}
                    href={`/olympics?year=${y.year}&discipline=${selectedDisc}`}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      (selectedYear ?? defaultYear) === y.year
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                    }`}>
                    {y.year}
                    <span className="text-xs text-gray-400 ml-1">{y.city}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Results browser */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                {selectedYear ?? defaultYear} {CITIES_REVERSE[selectedYear ?? defaultYear] ?? ''} — Results
              </h2>
            </div>

            {/* Discipline tabs */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {DISCIPLINES.map(d => (
                <Link key={d}
                  href={`/olympics?year=${selectedYear ?? defaultYear}&discipline=${d}`}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedDisc === d
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/8 text-gray-300 hover:bg-white/15 border border-white/10'
                  }`}>
                  {d}
                </Link>
              ))}
            </div>

            {/* Medal podium for selected event */}
            {medals.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  {DISC_LABELS[selectedDisc]} — Final Standings
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {medals.filter(m => m.medal).slice(0, 3).map(m => (
                    <div key={`${m.playerName}-${m.noc}`}
                      className={`rounded-xl border p-4 text-center ${
                        m.medal === 'Gold' ? 'border-yellow-500/40 bg-yellow-500/8' :
                        m.medal === 'Silver' ? 'border-gray-400/30 bg-gray-400/8' :
                        'border-orange-400/30 bg-orange-500/8'
                      }`}>
                      <div className="text-3xl mb-1">{MEDAL_EMOJI[m.medal] ?? ''}</div>
                      <div className="text-sm font-bold text-white">{m.playerName}</div>
                      <div className="text-sm mt-1">{getFlag(m.noc)} <span className="text-gray-400">{m.noc}</span></div>
                    </div>
                  ))}
                </div>
                {/* Other finishers */}
                {medals.filter(m => !m.medal).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {medals.filter(m => !m.medal).slice(0, 8).map(m => (
                      <div key={`${m.playerName}-${m.noc}`}
                        className="bg-white/5 rounded-lg border border-white/8 px-3 py-2 flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-6 shrink-0">{m.position}</span>
                        <span className="text-sm">{getFlag(m.noc)}</span>
                        <span className="text-xs text-white truncate">{m.playerName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Match results by round */}
            {matches.length > 0 ? (
              <div className="space-y-6">
                {roundOrder.map(round => {
                  const roundMatches = matchesByRound.get(round) ?? []
                  return (
                    <div key={round}>
                      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        {ROUND_LABELS[round] ?? round}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {roundMatches.map((m, i) => {
                          const p1Won = m.winnerName === m.player1Name
                          const p2Won = m.winnerName === m.player2Name
                          return (
                            <div key={i} className="bg-white/5 rounded-xl border border-white/8 p-3">
                              <div className="flex items-center gap-3">
                                <div className={`flex-1 min-w-0 ${p1Won ? 'opacity-100' : 'opacity-60'}`}>
                                  <div className="flex items-center gap-1.5">
                                    {m.player1NOC && <span className="text-sm">{getFlag(m.player1NOC)}</span>}
                                    <span className={`text-sm font-medium truncate ${p1Won ? 'text-white' : 'text-gray-400'}`}>
                                      {m.player1Name}
                                    </span>
                                    {p1Won && <span className="text-xs text-green-400 shrink-0">✓</span>}
                                  </div>
                                </div>
                                <div className="text-xs text-gray-500 font-mono shrink-0 text-center">
                                  {m.walkover ? 'w/o' : m.score || '—'}
                                </div>
                                <div className={`flex-1 min-w-0 text-right ${p2Won ? 'opacity-100' : 'opacity-60'}`}>
                                  <div className="flex items-center justify-end gap-1.5">
                                    {p2Won && <span className="text-xs text-green-400 shrink-0">✓</span>}
                                    <span className={`text-sm font-medium truncate ${p2Won ? 'text-white' : 'text-gray-400'}`}>
                                      {m.player2Name}
                                    </span>
                                    {m.player2NOC && <span className="text-sm">{getFlag(m.player2NOC)}</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">
                Select a year above to view match-by-match results.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// Helper for city lookup
const CITIES_REVERSE: Record<number, string> = {
  1992: 'Barcelona', 1996: 'Atlanta', 2000: 'Sydney', 2004: 'Athens',
  2008: 'Beijing', 2012: 'London', 2016: 'Rio', 2020: 'Tokyo', 2024: 'Paris',
}
