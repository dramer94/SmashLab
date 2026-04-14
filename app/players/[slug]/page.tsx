import { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import {
  getPlayerBySlug,
  getPlayerStats,
  getPlayerH2HRecords,
  getFormTrend,
  getPlayerMatches,
  getFlag,
} from "@/lib/queries"
import { formatDate } from "@/lib/utils"
import { FormChart } from "@/components/form-chart"
import { MatchResultRow } from "@/components/match-result-row"

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const player = await getPlayerBySlug(slug)
  if (!player) return { title: "Player Not Found" }

  return {
    title: `${player.name} - Stats & Analytics`,
    description: `${player.name} (${player.country}) badminton analytics. World ranking #${player.worldRanking || 'N/A'}. Head-to-head records, form trends, and tournament performance.`,
    openGraph: {
      title: `${player.name} | SmashLab`,
      description: `${player.name} badminton stats - win rate, head-to-head records, form trend.`,
    },
  }
}

export default async function PlayerPage({ params }: Props) {
  const { slug } = await params
  const player = await getPlayerBySlug(slug)
  if (!player) notFound()

  const [stats, h2hRecords, formTrend, recentMatches] = await Promise.all([
    getPlayerStats(player.id),
    getPlayerH2HRecords(player.id),
    getFormTrend(player.id, 20),
    getPlayerMatches(player.id, 10),
  ])

  const flag = getFlag(player.country)
  const roundOrder = ['F', 'SF', 'QF', 'R16', 'R32', 'R64', 'Group']

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      {/* Player Header */}
      <div className="flex flex-col sm:flex-row items-start gap-6 mb-10">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-3xl font-bold text-white shrink-0">
          {player.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-white">{player.name}</h1>
            <span className="text-2xl">{flag}</span>
            <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 rounded text-sm font-medium border border-blue-600/30">
              {player.category}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-gray-400 text-sm">
            {player.worldRanking && (
              <span>World Ranking: <strong className="text-white">#{player.worldRanking}</strong></span>
            )}
            {player.height && <span>Height: {player.height}</span>}
            {player.playStyle && <span>{player.playStyle}</span>}
            {player.birthDate && (
              <span>Born: {formatDate(player.birthDate, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            )}
          </div>
          {player.bio && (
            <p className="text-gray-300 mt-3 max-w-2xl text-sm leading-relaxed">{player.bio}</p>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-10">
        {[
          { label: "Total Matches", value: stats.total },
          { label: "Wins", value: stats.wins, color: "text-green-400" },
          { label: "Losses", value: stats.losses, color: "text-red-400" },
          { label: "Win Rate", value: `${stats.winRate}%`, color: stats.winRate >= 50 ? "text-green-400" : "text-red-400" },
          { label: "Finals Record", value: `${stats.finals.wins}W-${stats.finals.losses}L`, color: "text-blue-400" },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--card)] rounded-xl border border-white/10 p-4 text-center">
            <div className={`text-2xl font-bold ${s.color || 'text-white'}`}>{s.value}</div>
            <div className="text-xs text-gray-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Form Trend Chart */}
      <div className="bg-[var(--card)] rounded-xl border border-white/10 p-6 mb-10">
        <h2 className="text-lg font-semibold text-white mb-4">Form Trend</h2>
        <FormChart data={formTrend} />
      </div>

      {/* Performance by Round */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-[var(--card)] rounded-xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Performance by Round</h2>
          <div className="space-y-2">
            {roundOrder
              .filter(r => stats.byRound[r])
              .map(round => {
                const data = stats.byRound[round]
                const total = data.wins + data.losses
                const pct = total > 0 ? Math.round((data.wins / total) * 100) : 0
                return (
                  <div key={round} className="flex items-center gap-3">
                    <span className="w-12 text-sm font-mono text-gray-400">{round}</span>
                    <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-300 w-20 text-right">
                      {data.wins}W-{data.losses}L ({pct}%)
                    </span>
                  </div>
                )
              })}
          </div>
        </div>

        <div className="bg-[var(--card)] rounded-xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Performance by Tournament Level</h2>
          <div className="space-y-2">
            {Object.entries(stats.byLevel)
              .sort(([a], [b]) => {
                const order = ['Major', 'Super 1000', 'Super 750', 'Super 500', 'Super 300']
                return order.indexOf(a) - order.indexOf(b)
              })
              .map(([level, data]) => {
                const total = data.wins + data.losses
                const pct = total > 0 ? Math.round((data.wins / total) * 100) : 0
                return (
                  <div key={level} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-400 truncate">{level}</span>
                    <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-300 w-20 text-right">
                      {data.wins}W-{data.losses}L ({pct}%)
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* Head-to-Head Records */}
      <div className="bg-[var(--card)] rounded-xl border border-white/10 p-6 mb-10">
        <h2 className="text-lg font-semibold text-white mb-4">Head-to-Head Records</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-white/10">
                <th className="text-left py-2 pr-4">Opponent</th>
                <th className="text-center py-2 px-2">Wins</th>
                <th className="text-center py-2 px-2">Losses</th>
                <th className="text-center py-2 px-2">Win %</th>
                <th className="text-right py-2 pl-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {h2hRecords.map((record) => {
                const total = record.wins + record.losses
                const pct = total > 0 ? Math.round((record.wins / total) * 100) : 0
                return (
                  <tr key={record.opponent.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 pr-4">
                      <Link href={`/players/${record.opponent.slug}`} className="text-white hover:text-blue-400 transition-colors">
                        {getFlag(record.opponent.country)} {record.opponent.name}
                      </Link>
                    </td>
                    <td className="text-center py-3 px-2 text-green-400 font-mono">{record.wins}</td>
                    <td className="text-center py-3 px-2 text-red-400 font-mono">{record.losses}</td>
                    <td className="text-center py-3 px-2">
                      <span className={pct >= 50 ? 'text-green-400' : 'text-red-400'}>{pct}%</span>
                    </td>
                    <td className="text-right py-3 pl-4">
                      <Link
                        href={`/head-to-head?p1=${player.slug}&p2=${record.opponent.slug}`}
                        className="text-blue-400 hover:text-blue-300 text-xs"
                      >
                        View H2H
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Matches */}
      <div className="bg-[var(--card)] rounded-xl border border-white/10 mb-10">
        <div className="p-6 pb-0">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Matches</h2>
        </div>
        <div className="divide-y divide-white/5">
          {recentMatches.map((match) => (
            <MatchResultRow key={match.id} match={match} highlightPlayerId={player.id} />
          ))}
        </div>
      </div>
    </div>
  )
}
