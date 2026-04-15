import { Metadata } from "next"
import { getAllPlayersGlobal, getMalaysianPlayers } from '@/lib/queries'
import { PlayerCard } from '@/components/player-card'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Players",
  description: "Browse badminton player profiles from around the world. Stats, head-to-head records, and tournament performance.",
}

interface PageProps {
  searchParams: Promise<{ country?: string; category?: string; q?: string; page?: string }>
}

export default async function PlayersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const country = params.country
  const category = params.category
  const search = params.q
  const page = parseInt(params.page || '1')

  const [result, malaysianPlayers] = await Promise.all([
    getAllPlayersGlobal({ country, category, search, page, limit: 48 }),
    !country && !search ? getMalaysianPlayers() : Promise.resolve([]),
  ])

  const categories = ['MS', 'WS', 'MD', 'WD', 'XD']

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Players</h1>
        <p className="text-gray-400 mt-1">
          {result.total.toLocaleString()} players from across the international circuit
        </p>
      </div>

      {/* Search bar */}
      <form method="GET" action="/players" className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder="Search players by name..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:bg-white/10"
          />
          {country && <input type="hidden" name="country" value={country} />}
          {category && <input type="hidden" name="category" value={category} />}
          <button type="submit" className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
            Search
          </button>
          {search && (
            <Link href="/players" className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg transition-colors">
              Clear
            </Link>
          )}
        </div>
      </form>

      {/* Category filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Link href={`/players${country ? `?country=${country}` : ''}`}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!category ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
          All
        </Link>
        {categories.map(cat => (
          <Link key={cat} href={`/players?category=${cat}${country ? `&country=${country}` : ''}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${category === cat ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
            {cat}
          </Link>
        ))}
      </div>

      {/* Malaysian spotlight — only when no filters */}
      {malaysianPlayers.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🇲🇾</span>
              <h2 className="text-xl font-bold text-white">Malaysian Players</h2>
            </div>
            <Link href="/generations?country=MAS"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
              View by generation →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {malaysianPlayers.map(p => <PlayerCard key={p.id} player={p} />)}
          </div>
        </section>
      )}

      {/* Global players grid */}
      <section>
        {(country || category || search) && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">
              {country ? `${country} Players` : category ? `${category} Players` : 'Search Results'}
            </h2>
            <Link href="/players" className="text-sm text-blue-400 hover:text-blue-300">Clear filters</Link>
          </div>
        )}
        {!country && !category && !search && (
          <h2 className="text-xl font-bold text-white mb-4">All Players</h2>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {result.players.map(p => <PlayerCard key={p.id} player={p} />)}
        </div>

        {/* Pagination */}
        {result.pages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {page > 1 && (
              <Link href={`/players?page=${page-1}${country?`&country=${country}`:''}${category?`&category=${category}`:''}${search?`&q=${search}`:''}`}
                className="px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20">
                &larr; Prev
              </Link>
            )}
            <span className="px-4 py-2 text-gray-400">Page {page} of {result.pages}</span>
            {page < result.pages && (
              <Link href={`/players?page=${page+1}${country?`&country=${country}`:''}${category?`&category=${category}`:''}${search?`&q=${search}`:''}`}
                className="px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20">
                Next &rarr;
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
