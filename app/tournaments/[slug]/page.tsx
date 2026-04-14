import { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getTournamentBySlug, getFlag } from "@/lib/queries"
import { formatDate } from "@/lib/utils"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const tournament = await getTournamentBySlug(slug)
  if (!tournament) return { title: "Tournament Not Found" }
  return {
    title: `${tournament.name} Results`,
    description: `${tournament.name} badminton results. ${tournament.level} tournament in ${tournament.location}, ${tournament.country}.`,
  }
}

const roundOrder: Record<string, number> = { 'F': 1, 'SF': 2, 'QF': 3, 'R16': 4, 'R32': 5, 'R64': 6, 'Group': 7 }

export default async function TournamentPage({ params }: Props) {
  const { slug } = await params
  const tournament = await getTournamentBySlug(slug)
  if (!tournament) notFound()

  // Group matches by category then by round
  const byCategory: Record<string, typeof tournament.matches> = {}
  for (const match of tournament.matches) {
    if (!byCategory[match.category]) byCategory[match.category] = []
    byCategory[match.category].push(match)
  }

  const categoryOrder = ['MS', 'WS', 'MD', 'WD', 'XD']
  const sortedCategories = Object.keys(byCategory).sort(
    (a, b) => (categoryOrder.indexOf(a) ?? 99) - (categoryOrder.indexOf(b) ?? 99)
  )

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <Link href="/tournaments" className="text-blue-400 hover:text-blue-300 text-sm">&larr; All Tournaments</Link>
        <h1 className="text-3xl font-bold text-white mt-3">{tournament.name}</h1>
        <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-400">
          <span>{tournament.level}</span>
          <span>&middot;</span>
          <span>{tournament.location}, {tournament.country}</span>
          <span>&middot;</span>
          <span>{formatDate(tournament.startDate)} - {tournament.endDate ? formatDate(tournament.endDate) : 'TBD'}</span>
        </div>
      </div>

      {sortedCategories.map(category => {
        const matches = byCategory[category].sort(
          (a, b) => (roundOrder[a.round] ?? 99) - (roundOrder[b.round] ?? 99)
        )
        return (
          <div key={category} className="mb-10">
            <h2 className="text-lg font-semibold text-blue-400 mb-4">
              {category === 'MS' ? "Men's Singles" :
               category === 'WS' ? "Women's Singles" :
               category === 'MD' ? "Men's Doubles" :
               category === 'WD' ? "Women's Doubles" :
               category === 'XD' ? "Mixed Doubles" : category}
            </h2>
            <div className="bg-[var(--card)] rounded-xl border border-white/10 divide-y divide-white/5">
              {matches.map(match => {
                const p1Won = match.winnerId === match.player1Id
                const p2Won = match.winnerId === match.player2Id
                return (
                  <div key={match.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                    <span className="w-10 text-xs text-gray-500 font-mono">{match.round}</span>
                    <div className="flex-1 text-right">
                      <Link href={`/players/${match.player1.slug}`} className={`hover:text-blue-400 transition-colors ${p1Won ? 'text-green-400 font-semibold' : 'text-gray-300'}`}>
                        {getFlag(match.player1.country)} {match.player1.name}
                      </Link>
                      {match.player1Partner && <span className="text-gray-500 text-xs"> / {match.player1Partner}</span>}
                    </div>
                    <span className="text-white font-mono text-xs min-w-[90px] text-center">{match.score}</span>
                    <div className="flex-1">
                      <Link href={`/players/${match.player2.slug}`} className={`hover:text-blue-400 transition-colors ${p2Won ? 'text-green-400 font-semibold' : 'text-gray-300'}`}>
                        {getFlag(match.player2.country)} {match.player2.name}
                      </Link>
                      {match.player2Partner && <span className="text-gray-500 text-xs"> / {match.player2Partner}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
