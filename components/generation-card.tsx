import Link from "next/link"
import { getFlag } from "@/lib/utils"
import type { GenerationSummary } from "@/lib/queries"

function getInitials(name: string): string {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)
}

export function GenerationCard({ gen }: { gen: GenerationSummary }) {
  const flag = getFlag(gen.country)
  const yearRange = gen.birthYearStart && gen.birthYearEnd
    ? `Born ${gen.birthYearStart}–${gen.birthYearEnd}`
    : gen.birthYearStart ? `Born ${gen.birthYearStart}+` : null
  const activeRange = gen.activeStart && gen.activeEnd
    ? `Active ${gen.activeStart}–${gen.activeEnd}`
    : gen.activeStart ? `Active ${gen.activeStart}–present` : null

  return (
    <Link href={`/generations/${gen.slug}`} className="group block">
      <div className="bg-white/5 rounded-2xl border border-white/10 p-5 hover:border-blue-500/40 hover:bg-white/8 transition-all duration-200 hover:-translate-y-0.5 h-full flex flex-col">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{flag}</span>
            <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors leading-tight">
              {gen.label}
            </h3>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {yearRange && <span>{yearRange}</span>}
            {activeRange && <span>{activeRange}</span>}
          </div>
        </div>

        {/* Player avatars */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {gen.players.slice(0, 6).map(p => (
            <div key={p.id} className="relative group/avatar" title={p.name}>
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-white/10 ring-2 ring-white/10 flex items-center justify-center text-xs font-bold text-gray-400">
                  {getInitials(p.name)}
                </div>
              )}
            </div>
          ))}
          {gen.playerCount > 6 && (
            <div className="h-10 w-10 rounded-full bg-white/10 ring-2 ring-white/10 flex items-center justify-center text-xs text-gray-400 font-medium">
              +{gen.playerCount - 6}
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="mt-auto grid grid-cols-3 gap-2 pt-3 border-t border-white/8">
          <div className="text-center">
            <div className="text-lg font-bold text-yellow-400">{gen.titles}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Titles</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">{gen.playerCount}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Players</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-white">{gen.totalMatches >= 1000 ? `${(gen.totalMatches / 1000).toFixed(1)}k` : gen.totalMatches}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Matches</div>
          </div>
        </div>
      </div>
    </Link>
  )
}
