import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getGenerationBySlug } from "@/lib/queries"
import { PlayerCard } from "@/components/player-card"
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
        <div className="flex flex-wrap gap-3 text-sm text-gray-400 mb-4">
          {yearRange && (
            <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">
              Born {yearRange}
            </span>
          )}
          {activeRange && (
            <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">
              Active {activeRange}
            </span>
          )}
        </div>
        {gen.description && (
          <p className="text-gray-400 leading-relaxed max-w-3xl">{gen.description}</p>
        )}
      </div>

      {/* Stats strip */}
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

      {/* Player roster */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">
          Players <span className="text-gray-500 font-normal text-base">({gen.players.length})</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {gen.players.map(p => (
            <PlayerCard key={p.id} player={p} />
          ))}
        </div>
      </div>

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
