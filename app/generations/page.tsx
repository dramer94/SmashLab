import { Metadata } from "next"
import Link from "next/link"
import { getGenerations } from "@/lib/queries"
import { GenerationCard } from "@/components/generation-card"
import { getFlag } from "@/lib/utils"

export const revalidate = 86400  // rebuild once per day

export const metadata: Metadata = {
  title: "Player Generations",
  description: "Explore badminton's greatest generations — the players who rose together, dominated together, and defined their era.",
}

const COUNTRIES = [
  { code: 'MAS', name: 'Malaysia' },
  { code: 'CHN', name: 'China' },
  { code: 'INA', name: 'Indonesia' },
  { code: 'KOR', name: 'Korea' },
  { code: 'JPN', name: 'Japan' },
  { code: 'DEN', name: 'Denmark' },
  { code: 'THA', name: 'Thailand' },
  { code: 'IND', name: 'India' },
]

interface PageProps {
  searchParams: Promise<{ country?: string }>
}

export default async function GenerationsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const country = params.country ?? 'MAS'

  const generations = await getGenerations(country)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Player Generations</h1>
        <p className="text-gray-400 mt-1 max-w-2xl">
          Badminton unfolds in waves — players who rise together, dominate together, and define their era.
          Explore the generational batches that shaped the sport.
        </p>
      </div>

      {/* Country tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {COUNTRIES.map(c => (
          <Link
            key={c.code}
            href={`/generations?country=${c.code}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              country === c.code
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
            }`}
          >
            <span>{getFlag(c.code)}</span>
            <span>{c.name}</span>
          </Link>
        ))}
      </div>

      {/* Generation cards */}
      {generations.length === 0 ? (
        <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
          <div className="text-4xl mb-3">🏸</div>
          <h2 className="text-lg font-bold text-white mb-1">No generations yet</h2>
          <p className="text-gray-500 text-sm">
            Run <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs">node --experimental-strip-types scripts/seed-generations.ts</code> to add generations.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {generations.map(gen => (
            <GenerationCard key={gen.id} gen={gen} />
          ))}
        </div>
      )}

      {/* Editorial note */}
      <p className="text-xs text-gray-600 mt-8 text-center">
        Generations are curated editorially based on birth year cohorts and era of peak performance.
        Auto-clustering via {' '}
        <code className="text-gray-500">compute-generations.ts</code> fills in additional nations.
      </p>
    </div>
  )
}
