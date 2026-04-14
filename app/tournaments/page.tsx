import { Metadata } from "next"
import Link from "next/link"
import { getTournaments, getTournamentYears } from "@/lib/queries"
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
  "Super 100": "bg-teal-500/20 text-teal-400 border-teal-500/30",
  "Major": "bg-red-500/20 text-red-400 border-red-500/30",
  "Team": "bg-orange-500/20 text-orange-400 border-orange-500/30",
}

interface PageProps {
  searchParams: Promise<{ year?: string }>
}

export default async function TournamentsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const currentYear = new Date().getFullYear()
  const selectedYear = params.year ? parseInt(params.year) : currentYear

  const [tournaments, years] = await Promise.all([
    getTournaments(selectedYear),
    getTournamentYears(),
  ])

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Tournaments</h1>
        <p className="text-gray-400">BWF World Tour and international tournament results</p>
      </div>

      {/* Year selector */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        {years.map((year) => (
          <Link
            key={year}
            href={`/tournaments?year=${year}`}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              year === selectedYear
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {year}
          </Link>
        ))}
      </div>

      {/* Tournament list */}
      {tournaments.length === 0 ? (
        <p className="text-gray-400 text-center py-12">No tournaments found for {selectedYear}</p>
      ) : (
        <div className="space-y-3">
          {tournaments.map((tournament) => (
            <Link
              key={tournament.id}
              href={`/tournaments/${tournament.slug}`}
              className="block bg-[var(--card)] rounded-xl border border-white/10 p-4 hover:border-blue-500/40 transition-colors"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-white font-medium">{tournament.name}</div>
                  <div className="text-sm text-gray-400 mt-0.5">
                    {[tournament.location, tournament.country].filter(Boolean).join(', ')}
                    {tournament.startDate && ` · ${formatDate(tournament.startDate)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {tournament.level && (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${levelColors[tournament.level] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {tournament.level}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{tournament._count.matches} matches</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
