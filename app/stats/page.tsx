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

// ── Shared UI components ──────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5 text-center">
      <div className="text-3xl font-bold text-blue-400">{value}</div>
      <div className="text-sm font-medium text-white mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      {sub && <p className="text-sm text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// Renders any scraped table (25 rows from badmintonstatistics.net)
function ExternalTable({ stat, maxRows = 25 }: { stat: ExternalStatRow; maxRows?: number }) {
  if (!stat || stat.rows.length === 0) return null
  const rows = stat.rows.slice(0, maxRows)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            {stat.headers.map((h, i) => (
              <th key={i} className="py-2 px-3 text-left text-xs font-semibold text-gray-400 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-white/5 transition-colors">
              {row.cells.map((cell, ci) => (
                <td key={ci} className={`py-2 px-3 text-sm whitespace-nowrap ${ci === 0 ? 'text-white font-medium' : 'text-gray-300'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StatsPage() {
  const [
    matchLeaders, winLeaders, titleLeaders,
    rivalries, countryWins, threeSetStats, siteStats,
    // External stats from badmintonstatistics.net
    winsAll, winsMS, winsWS,
    firstSetWins, firstSetLosses,
    calendarYears, weeksTop10,
    pointsH2H, performanceWC,
  ] = await Promise.all([
    // Our own DB stats
    getCareerMatchLeaders(),
    getCareerWinLeaders(),
    getTitleLeaders(),
    getGreatestRivalries(),
    getCountryWins(),
    getThreeSetStats(),
    getSiteStats(),
    // External
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

  const totalMatches = threeSetStats.reduce((sum, r) => sum + Number(r.total), 0)
  const totalThreeSet = threeSetStats.reduce((sum, r) => sum + Number(r.three_set), 0)
  const globalThreeSetPct = totalMatches > 0 ? Math.round((totalThreeSet / totalMatches) * 100) : 0
  const topCountry = countryWins[0]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Records &amp; Stats</h1>
        <p className="text-gray-400 mt-1">
          All-time records computed from {siteStats.matches.toLocaleString()} matches across {siteStats.tournaments.toLocaleString()} tournaments
        </p>
      </div>

      {/* Quick numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
        <StatCard label="Total Matches" value={siteStats.matches.toLocaleString()} sub="since 1990s" />
        <StatCard label="Active Players" value={siteStats.totalPlayers.toLocaleString()} />
        <StatCard label="3-Set Rate" value={`${globalThreeSetPct}%`} sub="of matches go 3 sets" />
        <StatCard
          label="Top Nation"
          value={topCountry ? `${getFlag(topCountry.country)} ${topCountry.country}` : "—"}
          sub={topCountry ? `${Number(topCountry.wins).toLocaleString()} wins` : undefined}
        />
      </div>

      {/* ── Career Leaderboards (our DB) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-14">
        {/* Most Matches */}
        <div>
          <SectionHeader title="Most Matches Played" sub="Career appearances (min. 100)" />
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            {matchLeaders.map((p, i) => (
              <Link key={p.id} href={`/players/${p.slug}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                <span className="text-sm font-mono text-gray-500 w-5 shrink-0">{i + 1}</span>
                <span className="text-base shrink-0">{getFlag(p.country)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.category}</div>
                </div>
                <span className="text-sm font-bold text-blue-400 shrink-0">{p.matchCount.toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Most Wins */}
        <div>
          <SectionHeader title="Most Career Wins" sub="All-time wins (min. 100 matches)" />
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            {winLeaders.map((p, i) => (
              <Link key={p.id} href={`/players/${p.slug}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                <span className="text-sm font-mono text-gray-500 w-5 shrink-0">{i + 1}</span>
                <span className="text-base shrink-0">{getFlag(p.country)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.winRate}% win rate</div>
                </div>
                <span className="text-sm font-bold text-green-400 shrink-0">{Number(p.wins).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Most Titles */}
        <div>
          <SectionHeader title="Most Tournament Titles" sub="Finals wins (any level)" />
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            {titleLeaders.map((p, i) => (
              <Link key={p.id} href={`/players/${p.slug}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                <span className="text-sm font-mono text-gray-500 w-5 shrink-0">{i + 1}</span>
                <span className="text-base shrink-0">{getFlag(p.country)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{p.name}</div>
                </div>
                <span className="text-sm font-bold text-yellow-400 shrink-0">{Number(p.titles)} 🏆</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Win Rates (from badmintonstatistics.net) ── */}
      {winsAll && (
        <section className="mb-14">
          <SectionHeader
            title="Best Win Rates — World Tour"
            sub="Players with the best winning percentages across all disciplines (current season, min. 10 matches) · Source: badmintonstatistics.net"
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { label: "All Disciplines", stat: winsAll },
              { label: "Men's Singles", stat: winsMS },
              { label: "Women's Singles", stat: winsWS },
            ].filter(s => s.stat).map(({ label, stat }) => (
              <div key={label} className="bg-white/5 rounded-xl border border-white/10 p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">{label}</h3>
                <ExternalTable stat={stat!} maxRows={10} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── First Set Effect ── */}
      {firstSetWins && firstSetLosses && (
        <section className="mb-14">
          <SectionHeader
            title="The First Set Effect"
            sub="How often does winning the first set lead to winning the match? · Source: badmintonstatistics.net"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-green-400 mb-3">After Winning First Set</h3>
              <ExternalTable stat={firstSetWins} maxRows={15} />
            </div>
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-red-400 mb-3">After Losing First Set (Comebacks)</h3>
              <ExternalTable stat={firstSetLosses} maxRows={15} />
            </div>
          </div>
        </section>
      )}

      {/* ── Calendar Years & Consistency ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-14">
        {calendarYears && (
          <section>
            <SectionHeader
              title="Most Calendar Years With Finals"
              sub="Longevity at the top · Source: badmintonstatistics.net"
            />
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <ExternalTable stat={calendarYears} maxRows={20} />
            </div>
          </section>
        )}
        {weeksTop10 && (
          <section>
            <SectionHeader
              title="Weeks in World Top 10"
              sub="All-time consistency rankings · Source: badmintonstatistics.net"
            />
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <ExternalTable stat={weeksTop10} maxRows={20} />
            </div>
          </section>
        )}
      </div>

      {/* ── Points H2H & Post-WC Performance ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-14">
        {pointsH2H && (
          <section>
            <SectionHeader
              title="Biggest H2H Point Tallies"
              sub="Rivalries with the most total points scored · Source: badmintonstatistics.net"
            />
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <ExternalTable stat={pointsH2H} maxRows={20} />
            </div>
          </section>
        )}
        {performanceWC && (
          <section>
            <SectionHeader
              title="Performance After World Championships Win"
              sub="How world champions perform in following tournaments · Source: badmintonstatistics.net"
            />
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <ExternalTable stat={performanceWC} maxRows={20} />
            </div>
          </section>
        )}
      </div>

      {/* ── Greatest Rivalries (our DB) ── */}
      <section className="mb-14">
        <SectionHeader title="Greatest Rivalries" sub="Most-played head-to-head pairings of all time" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rivalries.slice(0, 12).map((r, i) => (
            <div key={`${r.pid1}-${r.pid2}`} className="bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 font-mono">#{i + 1}</span>
                <span className="text-xs font-bold text-blue-400">{Number(r.matches)} matches</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{getFlag(r.country1)}</span>
                <Link href={`/players/${r.slug1}`} className="text-sm font-medium text-white hover:text-blue-400 transition-colors truncate">
                  {r.name1}
                </Link>
              </div>
              <div className="text-xs text-gray-500 text-center my-1">vs</div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{getFlag(r.country2)}</span>
                <Link href={`/players/${r.slug2}`} className="text-sm font-medium text-white hover:text-blue-400 transition-colors truncate">
                  {r.name2}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3-Set Breakdown (our DB) ── */}
      <section className="mb-14">
        <SectionHeader title="3-Set Battle Rate by Discipline" sub="How often does each discipline go to a deciding set?" />
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {threeSetStats.map((row) => {
            const pct = Number(row.total) > 0
              ? Math.round((Number(row.three_set) / Number(row.total)) * 100) : 0
            return (
              <div key={row.category} className="bg-white/5 rounded-xl border border-white/10 p-4 text-center">
                <div className="text-lg font-bold text-white mb-1">{row.category}</div>
                <div className="text-2xl font-bold text-blue-400">{pct}%</div>
                <div className="text-xs text-gray-500 mt-1">{CATEGORY_LABELS[row.category] ?? row.category}</div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {Number(row.three_set).toLocaleString()} / {Number(row.total).toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Country Power Rankings (our DB) ── */}
      <section>
        <SectionHeader title="Country Power Rankings" sub="All-time match wins by nation" />
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-x-0 sm:divide-x divide-white/5">
            {[countryWins.slice(0, 10), countryWins.slice(10, 20)].map((group, gi) => (
              <div key={gi} className="divide-y divide-white/5">
                {group.map((row, i) => {
                  const rank = gi * 10 + i + 1
                  const maxWins = Number(countryWins[0]?.wins ?? 1)
                  const barPct = Math.round((Number(row.wins) / maxWins) * 100)
                  return (
                    <Link key={row.country} href={`/players?country=${row.country}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group">
                      <span className="text-sm font-mono text-gray-500 w-5 shrink-0">{rank}</span>
                      <span className="text-base shrink-0">{getFlag(row.country)}</span>
                      <span className="text-sm font-medium text-white w-10 shrink-0">{row.country}</span>
                      <div className="flex-1 min-w-0">
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
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
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
