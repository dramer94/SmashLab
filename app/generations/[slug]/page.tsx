import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getGenerationBySlug } from "@/lib/queries"
import { getFlag } from "@/lib/utils"

export const revalidate = 86400

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const gen = await getGenerationBySlug(slug)
  if (!gen) return { title: "Generation Not Found" }
  return {
    title: `${gen.label} — SmashLab Generations`,
    description: gen.description ?? `${gen.label} — ${gen.playerCount} players, ${gen.titles} titles.`,
  }
}

const CATEGORY_ORDER = ['MS', 'WS', 'MD', 'WD', 'XD']
const CATEGORY_LABEL: Record<string, string> = {
  MS: "Men's Singles",
  WS: "Women's Singles",
  MD: "Men's Doubles",
  WD: "Women's Doubles",
  XD: "Mixed Doubles",
}

function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

export default async function GenerationDetailPage({ params }: PageProps) {
  const { slug } = await params
  const gen = await getGenerationBySlug(slug)
  if (!gen) notFound()

  const flag = getFlag(gen.country)
  const yearRange = gen.birthYearStart && gen.birthYearEnd
    ? `${gen.birthYearStart}–${gen.birthYearEnd}`
    : gen.birthYearStart ? `${gen.birthYearStart}+` : null
  const activeRange = gen.activeStart && gen.activeEnd
    ? `${gen.activeStart}–${gen.activeEnd}`
    : gen.activeStart ? `${gen.activeStart}–present` : null

  // Group players by category
  const byCategory = CATEGORY_ORDER.reduce((acc, cat) => {
    const players = gen.players.filter(p => p.category === cat)
    if (players.length > 0) acc[cat] = players
    return acc
  }, {} as Record<string, typeof gen.players>)

  const disciplineStats = gen.disciplineStats ?? []

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      {/* Back link */}
      <Link href={`/generations?country=${gen.country}`}
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-6 inline-flex items-center gap-1">
        ← Generations
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-4xl">{flag}</span>
          <h1 className="text-3xl font-bold text-white">{gen.label}</h1>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {yearRange && (
            <span className="inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
              <span className="text-gray-600 text-xs uppercase tracking-wide">Born</span>
              <span className="text-white font-medium">{yearRange}</span>
            </span>
          )}
          {activeRange && (
            <span className="inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300">
              <span className="text-blue-500 text-xs uppercase tracking-wide">Peak years</span>
              <span className="font-medium">{activeRange}</span>
            </span>
          )}
        </div>
        {gen.description && (
          <p className="text-gray-400 leading-relaxed max-w-3xl">{gen.description}</p>
        )}
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        {[
          { label: 'Players', value: gen.playerCount, color: 'text-blue-400' },
          { label: 'Combined Titles', value: gen.titles, color: 'text-yellow-400' },
          { label: 'Total Matches', value: gen.totalMatches >= 1000 ? `${(gen.totalMatches / 1000).toFixed(1)}k` : gen.totalMatches, color: 'text-white' },
          { label: 'Years Active', value: gen.activeStart && gen.activeEnd ? gen.activeEnd - gen.activeStart : '—', color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-white/5 rounded-xl border border-white/10 p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Discipline breakdown */}
      {disciplineStats.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xl font-bold text-white mb-4">By Discipline</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {disciplineStats.map(d => {
              const players = byCategory[d.category] ?? []
              const topPlayer = players[0]
              return (
                <div key={d.category} className="bg-white/5 rounded-xl border border-white/10 p-5">
                  {/* Discipline header */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">{d.category}</span>
                      <div className="text-sm text-gray-400">{CATEGORY_LABEL[d.category]}</div>
                    </div>
                    <span className="text-xs text-gray-600 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
                      {d.playerCount} player{d.playerCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center">
                      <div className="text-xl font-bold text-yellow-400">{d.titles}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Titles</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-white">{d.totalMatches >= 1000 ? `${(d.totalMatches / 1000).toFixed(1)}k` : d.totalMatches}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Matches</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-xl font-bold ${d.winRate >= 55 ? 'text-green-400' : d.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>{d.winRate}%</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Win Rate</div>
                    </div>
                  </div>

                  {/* Win rate bar */}
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-4">
                    <div
                      className={`h-full rounded-full ${d.winRate >= 55 ? 'bg-green-500' : d.winRate >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(d.winRate, 100)}%` }}
                    />
                  </div>

                  {/* Players list */}
                  <div className="space-y-2">
                    {players.map(p => (
                      <Link key={p.id} href={`/players/${p.slug}`}
                        className="flex items-center gap-2.5 group hover:bg-white/5 rounded-lg px-1 py-1 -mx-1 transition-colors">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name}
                            className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10 shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-white/10 ring-1 ring-white/10 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0">
                            {getInitials(p.name)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors truncate">{p.name}</div>
                          <div className="text-[10px] text-gray-500">{p.matchCount} matches</div>
                        </div>
                        {(p.titles ?? 0) > 0 && (
                          <div className="text-xs text-yellow-400 font-bold shrink-0">{p.titles}T</div>
                        )}
                        {p.winRate !== undefined && (
                          <div className={`text-xs font-mono shrink-0 ${(p.winRate ?? 0) >= 50 ? 'text-green-400' : 'text-gray-500'}`}>
                            {p.winRate}%
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Context link */}
      <div className="mt-10 pt-6 border-t border-white/10 flex items-center justify-between text-sm">
        <Link href={`/generations?country=${gen.country}`}
          className="text-gray-500 hover:text-gray-300 transition-colors">
          ← All {gen.country} generations
        </Link>
        <Link href={`/players?country=${gen.country}`}
          className="text-blue-400 hover:underline">
          All {gen.country} players →
        </Link>
      </div>
    </div>
  )
}
