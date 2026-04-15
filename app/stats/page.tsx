import { Metadata } from "next"
import Link from "next/link"
import {
  getCareerMatchLeaders,
  getCareerWinLeaders,
  getTitleLeaders,
  getGreatestRivalries,
  getCountryWins,
  getThreeSetStats,
  getSiteStats,
  getExternalStat,
  getMostWinsInAYear,
  getMostTitlesInAYear,
  type ExternalStatRow,
} from "@/lib/queries"
import { getFlag } from "@/lib/utils"

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Records & Stats",
  description: "All-time badminton records: career leaders, greatest rivalries, country rankings, and match statistics from 411,000+ matches.",
}

const CATEGORY_LABELS: Record<string, string> = {
  MS: "Men's Singles", WS: "Women's Singles",
  MD: "Men's Doubles", WD: "Women's Doubles", XD: "Mixed Doubles",
}

const MEDAL = ['🥇', '🥈', '🥉']
const MEDAL_COLORS = [
  'border-yellow-500/40 bg-yellow-500/8',
  'border-gray-400/30 bg-gray-400/8',
  'border-orange-400/30 bg-orange-500/8',
]
const STAT_COLORS = ['text-yellow-400', 'text-gray-300', 'text-orange-400']

// ── Leaderboard: top-3 visual cards + compact 4–N rows ───────────────────────

type LeaderEntry = {
  id: string; name: string; slug: string; country: string
  category?: string; stat: number; sub?: string
}

function Leaderboard({ title, entries, unit = '' }: {
  title: string
  entries: LeaderEntry[]
  unit?: string
}) {
  const top3 = entries.slice(0, 3)
  const rest = entries.slice(3)
  return (
    <div>
      <h3 className="text-base font-bold text-white mb-3">{title}</h3>
      {/* Top 3 cards */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {top3.map((p, i) => (
          <Link key={p.id} href={`/players/${p.slug}`}
            className={`rounded-xl border p-3 flex flex-col gap-1 hover:opacity-80 transition-opacity ${MEDAL_COLORS[i]}`}>
            <span className="text-lg leading-none">{MEDAL[i]}</span>
            <span className={`text-2xl font-black leading-none ${STAT_COLORS[i]}`}>
              {p.stat.toLocaleString()}{unit}
            </span>
            <span className="text-xs font-semibold text-white truncate">{p.name}</span>
            <span className="text-xs text-gray-500">{getFlag(p.country)} {p.country}{p.category ? ` · ${p.category}` : ''}</span>
          </Link>
        ))}
      </div>
      {/* Compact rows for 4–N */}
      <div className="space-y-0">
        {rest.map((p, i) => (
          <Link key={p.id} href={`/players/${p.slug}`}
            className="flex items-center gap-2 py-1.5 border-b border-white/5 hover:bg-white/5 px-1 transition-colors">
            <span className="text-xs text-gray-600 w-4 shrink-0 text-right">{i + 4}</span>
            <span className="text-sm shrink-0">{getFlag(p.country)}</span>
            <span className="text-sm text-white flex-1 truncate">{p.name}</span>
            {p.category && <span className="text-xs text-gray-600 shrink-0">{p.category}</span>}
            <span className="text-xs font-bold text-blue-400 shrink-0">{p.stat.toLocaleString()}{unit}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── External stats table (scraped from badmintonstatistics.net) ───────────────

function ExternalTable({ stat, maxRows = 20 }: { stat: ExternalStatRow; maxRows?: number }) {
  if (!stat || stat.rows.length === 0) return null
  const rows = stat.rows.slice(0, maxRows)
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-white/10">
          {stat.headers.map((h, i) => (
            <th key={i} className="py-1.5 pr-4 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className={`border-b border-white/5 ${ri < 3 ? 'bg-white/3' : ''}`}>
            {row.cells.map((cell, ci) => (
              <td key={ci} className={`py-1.5 pr-4 whitespace-nowrap text-sm ${ci === 0 ? 'text-white font-medium' : 'text-gray-400'}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Stat number tile ──────────────────────────────────────────────────────────

function BigStat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5 text-center">
      <div className="text-3xl font-black text-blue-400">{value}</div>
      <div className="text-sm font-semibold text-white mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StatsPage() {
  const [
    matchLeaders, winLeaders, titleLeaders,
    rivalries, countryWins, threeSetStats, siteStats,
    winsInYear, titlesInYear,
    winsAll, winsMS, winsWS,
    firstSetWins, firstSetLosses,
    calendarYears, weeksTop10,
    pointsH2H, performanceWC,
  ] = await Promise.all([
    getCareerMatchLeaders(),
    getCareerWinLeaders(),
    getTitleLeaders(),
    getGreatestRivalries(),
    getCountryWins(),
    getThreeSetStats(),
    getSiteStats(),
    getMostWinsInAYear(),
    getMostTitlesInAYear(),
    getExternalStat('PlayerWinsAndLosses', '%'),
    getExternalStat('PlayerWinsAndLosses', 'MS'),
    getExternalStat('PlayerWinsAndLosses', 'WS'),
    getExternalStat('FirstSetWins', '%'),
    getExternalStat('FirstSetLosses', '%'),
    getExternalStat('MostCalendarYearsWithFinal', '%'),
    getExternalStat('WeeksInTop10Ranking', '%'),
    getExternalStat('MostPointsH2H', '%'),
    getExternalStat('PerformanceFollowingWorldChampionship', '%'),
  ])

  const totalMatches = threeSetStats.reduce((s, r) => s + Number(r.total), 0)
  const totalThreeSet = threeSetStats.reduce((s, r) => s + Number(r.three_set), 0)
  const threeSetPct = totalMatches > 0 ? Math.round((totalThreeSet / totalMatches) * 100) : 0
  const topCountry = countryWins[0]

  // Shape career entries
  const matchEntries: LeaderEntry[] = matchLeaders.map(p => ({
    id: p.id, name: p.name, slug: p.slug, country: p.country,
    category: p.category, stat: p.matchCount,
  }))
  const winEntries: LeaderEntry[] = winLeaders.map(p => ({
    id: p.id, name: p.name, slug: p.slug, country: p.country,
    stat: Number(p.wins), sub: `${p.winRate}% WR`,
  }))
  const titleEntries: LeaderEntry[] = titleLeaders.map(p => ({
    id: p.id, name: p.name, slug: p.slug, country: p.country,
    stat: Number(p.titles),
  }))

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Records &amp; Stats</h1>
        <p className="text-gray-400 mt-1">
          {siteStats.matches.toLocaleString()} matches · {siteStats.tournaments.toLocaleString()} tournaments · {siteStats.totalPlayers.toLocaleString()} active players
        </p>
      </div>

      {/* Jump links */}
      <div className="flex flex-wrap gap-2 mb-10 pb-6 border-b border-white/10">
        {[
          ['#career', 'Career Records'],
          ['#season', 'Season Bests'],
          ['#rivalries', 'Rivalries'],
          ['#battle', 'Battle Stats'],
          ['#countries', 'Countries'],
          ['#external', 'More Stats'],
        ].map(([href, label]) => (
          <a key={href} href={href}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/8 text-gray-300 hover:bg-blue-600 hover:text-white transition-colors border border-white/10">
            {label}
          </a>
        ))}
      </div>

      {/* Top-line numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
        <BigStat value={siteStats.matches.toLocaleString()} label="Total Matches" sub="since 1990s" />
        <BigStat value={siteStats.totalPlayers.toLocaleString()} label="Active Players" />
        <BigStat value={`${threeSetPct}%`} label="3-Set Rate" sub="go to deciding set" />
        <BigStat
          value={topCountry ? `${getFlag(topCountry.country)} ${topCountry.country}` : '—'}
          label="Top Nation"
          sub={topCountry ? `${Number(topCountry.wins).toLocaleString()} wins all-time` : undefined}
        />
      </div>

      {/* ── Career Records ── */}
      <section id="career" className="mb-14">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="w-1 h-5 bg-blue-500 rounded-full inline-block" />
          Career Records
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Leaderboard title="Most Matches Played" entries={matchEntries} />
          <Leaderboard title="Most Career Wins" entries={winEntries} />
          <Leaderboard title="Most Tournament Titles" entries={titleEntries} />
        </div>
      </section>

      {/* ── Season Bests ── */}
      <section id="season" className="mb-14">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="w-1 h-5 bg-green-500 rounded-full inline-block" />
          Season Bests
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Leaderboard
            title="Most Match Wins in a Single Year"
            entries={winsInYear.map(p => ({
              id: p.id, name: p.name, slug: p.slug, country: p.country,
              category: `${p.year} · ${p.category}`, stat: p.wins,
            }))}
          />
          <Leaderboard
            title="Most Tournament Titles in a Single Year"
            entries={titlesInYear.map(p => ({
              id: p.id, name: p.name, slug: p.slug, country: p.country,
              category: String(p.year), stat: p.titles,
            }))}
          />
        </div>
      </section>

      {/* ── Rivalries ── */}
      <section id="rivalries" className="mb-14">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="w-1 h-5 bg-purple-500 rounded-full inline-block" />
          Greatest Rivalries
          <span className="text-sm font-normal text-gray-400 ml-1">— most head-to-head meetings all time</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {rivalries.slice(0, 12).map((r, i) => (
            <div key={`${r.pid1}-${r.pid2}`} className="bg-white/5 rounded-xl border border-white/10 p-4 hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-gray-600">#{i + 1}</span>
                <span className="text-sm font-black text-blue-400">{Number(r.matches)} matches</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-base shrink-0">{getFlag(r.country1)}</span>
                  <Link href={`/players/${r.slug1}`} className="text-sm font-medium text-white hover:text-blue-400 transition-colors truncate">
                    {r.name1}
                  </Link>
                </div>
                <div className="flex items-center gap-2 pl-1">
                  <span className="text-xs text-gray-600 italic">vs</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base shrink-0">{getFlag(r.country2)}</span>
                  <Link href={`/players/${r.slug2}`} className="text-sm font-medium text-white hover:text-blue-400 transition-colors truncate">
                    {r.name2}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Battle Stats ── */}
      <section id="battle" className="mb-14">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="w-1 h-5 bg-red-500 rounded-full inline-block" />
          Battle Statistics
        </h2>

        {/* 3-set rates grid */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">3-Set Rate by Discipline</h3>
          <div className="grid grid-cols-5 gap-3">
            {threeSetStats.map((row) => {
              const pct = Number(row.total) > 0
                ? Math.round((Number(row.three_set) / Number(row.total)) * 100) : 0
              const barW = pct
              return (
                <div key={row.category} className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <div className="text-sm font-bold text-white mb-1">{row.category}</div>
                  <div className="text-2xl font-black text-blue-400 mb-1">{pct}%</div>
                  <div className="h-1 rounded-full bg-white/10 mb-2">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${barW}%` }} />
                  </div>
                  <div className="text-xs text-gray-500">{CATEGORY_LABELS[row.category]}</div>
                  <div className="text-xs text-gray-600">{Number(row.three_set).toLocaleString()} / {Number(row.total).toLocaleString()}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* First set effect */}
        {(firstSetWins || firstSetLosses) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {firstSetWins && (
              <div className="bg-white/5 rounded-xl border border-green-500/20 p-4">
                <h3 className="text-sm font-semibold text-green-400 mb-3">After Winning First Set</h3>
                <div className="overflow-x-auto"><ExternalTable stat={firstSetWins} maxRows={15} /></div>
              </div>
            )}
            {firstSetLosses && (
              <div className="bg-white/5 rounded-xl border border-red-500/20 p-4">
                <h3 className="text-sm font-semibold text-red-400 mb-3">After Losing First Set — Comebacks</h3>
                <div className="overflow-x-auto"><ExternalTable stat={firstSetLosses} maxRows={15} /></div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Country Rankings ── */}
      <section id="countries" className="mb-14">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="w-1 h-5 bg-yellow-500 rounded-full inline-block" />
          Country Power Rankings
          <span className="text-sm font-normal text-gray-400 ml-1">— all-time match wins</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
          {countryWins.slice(0, 20).map((row, i) => {
            const maxWins = Number(countryWins[0]?.wins ?? 1)
            const barPct = Math.round((Number(row.wins) / maxWins) * 100)
            return (
              <Link key={row.country} href={`/players?country=${row.country}`}
                className="flex items-center gap-3 py-2 border-b border-white/5 hover:bg-white/5 px-1 transition-colors group">
                <span className="text-xs text-gray-600 w-5 text-right shrink-0">{i + 1}</span>
                <span className="text-base shrink-0">{getFlag(row.country)}</span>
                <span className="text-sm font-medium text-white w-10 shrink-0">{row.country}</span>
                <div className="flex-1 min-w-0">
                  <div className="h-1.5 rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-blue-500 group-hover:bg-blue-400 transition-colors"
                      style={{ width: `${barPct}%` }} />
                  </div>
                </div>
                <span className="text-sm font-bold text-blue-400 shrink-0 w-16 text-right">
                  {Number(row.wins).toLocaleString()}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── More Stats (external) ── */}
      <section id="external" className="mb-14">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <span className="w-1 h-5 bg-cyan-500 rounded-full inline-block" />
          More Statistics
        </h2>
        <p className="text-xs text-gray-500 mb-6">
          Source: <a href="https://www.badmintonstatistics.net" target="_blank" rel="noopener noreferrer"
            className="text-blue-400 hover:underline">badmintonstatistics.net</a>
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {winsAll && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Best Win Rates — All Disciplines</h3>
              <div className="overflow-x-auto"><ExternalTable stat={winsAll} maxRows={12} /></div>
            </div>
          )}
          {winsMS && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Best Win Rates — Men&apos;s Singles</h3>
              <div className="overflow-x-auto"><ExternalTable stat={winsMS} maxRows={12} /></div>
            </div>
          )}
          {winsWS && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Best Win Rates — Women&apos;s Singles</h3>
              <div className="overflow-x-auto"><ExternalTable stat={winsWS} maxRows={12} /></div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {calendarYears && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Most Calendar Years With Finals</h3>
              <div className="overflow-x-auto"><ExternalTable stat={calendarYears} maxRows={20} /></div>
            </div>
          )}
          {weeksTop10 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Most Weeks in World Top 10</h3>
              <div className="overflow-x-auto"><ExternalTable stat={weeksTop10} maxRows={20} /></div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pointsH2H && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Biggest H2H Point Tallies</h3>
              <div className="overflow-x-auto"><ExternalTable stat={pointsH2H} maxRows={15} /></div>
            </div>
          )}
          {performanceWC && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Performance After World Championship Win</h3>
              <div className="overflow-x-auto"><ExternalTable stat={performanceWC} maxRows={15} /></div>
            </div>
          )}
        </div>
      </section>

    </div>
  )
}
