import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils"
import { getFlag } from "@/lib/queries"
import Link from "next/link"

interface MatchProps {
  match: {
    id: string
    round: string
    date: Date
    score: string
    winnerId: string | null
    player1Partner: string | null
    player2Partner: string | null
    player1: { id: string; name: string; slug: string; country: string }
    player2: { id: string; name: string; slug: string; country: string }
    tournament: { name: string; slug: string }
  }
  highlightPlayerId?: string
}

export function MatchResultRow({ match, highlightPlayerId }: MatchProps) {
  const p1Won = match.winnerId === match.player1.id
  const p2Won = match.winnerId === match.player2.id

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      {/* Players */}
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <Link
          href={`/players/${match.player1.slug}`}
          className={cn(
            "truncate text-sm hover:text-blue-400 transition-colors",
            p1Won ? "text-green-400 font-semibold" : "text-gray-400",
            highlightPlayerId === match.player1.id && "underline"
          )}
        >
          {getFlag(match.player1.country)} {match.player1.name}
          {match.player1Partner && <span className="text-gray-500 text-xs"> / {match.player1Partner}</span>}
        </Link>
        <span className="shrink-0 text-xs text-gray-600">vs</span>
        <Link
          href={`/players/${match.player2.slug}`}
          className={cn(
            "truncate text-sm hover:text-blue-400 transition-colors",
            p2Won ? "text-green-400 font-semibold" : "text-gray-400",
            highlightPlayerId === match.player2.id && "underline"
          )}
        >
          {getFlag(match.player2.country)} {match.player2.name}
          {match.player2Partner && <span className="text-gray-500 text-xs"> / {match.player2Partner}</span>}
        </Link>
      </div>

      {/* Score */}
      <div className="shrink-0">
        <span className="rounded bg-white/5 px-2 py-1 font-mono text-xs text-white">
          {match.score}
        </span>
      </div>

      {/* Tournament & Round */}
      <div className="flex items-center gap-2 sm:ml-auto">
        <span className="px-1.5 py-0.5 text-[10px] font-mono text-gray-400 border border-white/10 rounded">
          {match.round}
        </span>
        <Link href={`/tournaments/${match.tournament.slug}`} className="truncate text-xs text-gray-500 hover:text-gray-300">
          {match.tournament.name}
        </Link>
      </div>

      {/* Date */}
      <span className="shrink-0 text-xs text-gray-600 tabular-nums">
        {formatDate(match.date)}
      </span>
    </div>
  )
}
