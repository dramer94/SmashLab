import Link from "next/link"
import { getMalaysianPlayers, getLatestMatches, getSiteStats } from "@/lib/queries"
import { PlayerCard } from "@/components/player-card"
import { MatchResultRow } from "@/components/match-result-row"
import { formatDate } from "@/lib/utils"

export default async function HomePage() {
  const [players, latestMatches, stats] = await Promise.all([
    getMalaysianPlayers(),
    getLatestMatches(8),
    getSiteStats(),
  ])

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 px-4 sm:px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-transparent to-cyan-500/10" />
        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
              SmashLab
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-8">
            Deep analytics and insights for Malaysian badminton players.
            Head-to-head records, form trends, and tournament performance.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/players"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
            >
              Explore Players
            </Link>
            <Link
              href="/head-to-head"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors border border-white/20"
            >
              Head-to-Head
            </Link>
          </div>
        </div>
      </section>

      {/* Malaysian Players */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Malaysian Players</h2>
            <p className="text-gray-400 mt-1">Track Malaysia&apos;s top shuttlers across international tournaments</p>
          </div>
          <Link href="/players" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
            View all &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {players.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </div>
      </section>

      {/* Latest Results */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Latest Results</h2>
            <p className="text-gray-400 mt-1">Most recent match results from the international circuit</p>
          </div>
          <Link href="/tournaments" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
            All tournaments &rarr;
          </Link>
        </div>
        <div className="bg-[var(--card)] rounded-xl border border-white/10 divide-y divide-white/5">
          {latestMatches.map((match) => (
            <MatchResultRow key={match.id} match={match} />
          ))}
        </div>
      </section>

      {/* Quick Stats */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 mb-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            { label: "Active Players", value: stats.totalPlayers.toLocaleString() },
            { label: "Malaysian Players", value: stats.malaysianPlayers.toString() },
            { label: "Tournaments", value: stats.tournaments.toLocaleString() },
            { label: "Matches Recorded", value: stats.matches.toLocaleString() },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-[var(--card)] rounded-xl border border-white/10 p-4 text-center"
            >
              <div className="text-2xl font-bold text-blue-400">{stat.value}</div>
              <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
        {stats.latestMatchDate && (
          <p className="text-center text-xs text-gray-500">
            Data through {formatDate(stats.latestMatchDate)} · Updates weekly
          </p>
        )}
      </section>
    </div>
  )
}
