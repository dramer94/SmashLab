import { Metadata } from "next"
import Link from "next/link"
import { getTournaments } from "@/lib/queries"
import { formatDate } from "@/lib/utils"

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Tournaments",
  description: "Badminton tournament results tracked on SmashLab. BWF World Tour events, Olympics, and more.",
}

const levelColors: Record<string, string> = {
  "Super 1000": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "Super 750": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Super 500": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Super 300": "bg-green-500/20 text-green-400 border-green-500/30",
  "Major": "bg-red-500/20 text-red-400 border-red-500/30",
}

export default async function TournamentsPage() {
  const tournaments = await getTournaments()

  const byYear: Record<number, typeof tournaments> = {}
  for (const t of tournaments) {
    if (!byYear[t.year]) byYear[t.year] = []
    byYear[t.year].push(t)
  }

  const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a)

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Tournaments</h1>
      <p className="text-gray-400 mb-10">BWF World Tour and major tournament results</p>

      {sortedYears.map(year => (
        <div key={year} className="mb-10">
          <h2 className="text-xl font-semibold text-gray-300 mb-4">{year}</h2>
          <div className="space-y-3">
            {byYear[year].map(tournament => (
              <Link
                key={tournament.id}
                href={`/tournaments/${tournament.slug}`}
                className="block bg-[var(--card)] rounded-xl border border-white/10 p-4 hover:border-blue-500/40 transition-colors"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-white font-medium">{tournament.name}</div>
                    <div className="text-sm text-gray-400 mt-0.5">
                      {tournament.location}, {tournament.country} &middot; {formatDate(tournament.startDate)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${levelColors[tournament.level] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {tournament.level}
                    </span>
                    <span className="text-xs text-gray-500">{tournament._count.matches} matches</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
