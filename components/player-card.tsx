import Link from "next/link"
import { cn, getFlag } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

interface Player {
  name: string
  slug: string
  country: string
  category: string
  worldRanking: number | null
  imageUrl: string | null
  isActive: boolean
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}


export function PlayerCard({ player }: { player: Player }) {
  return (
    <Link href={`/players/${player.slug}`} className="group block">
      <Card className="transition-all duration-200 hover:border-[var(--primary)]/50 hover:shadow-lg hover:shadow-[var(--primary)]/5 hover:-translate-y-0.5">
        <CardContent className="flex items-center gap-4 p-4">
          {/* Avatar */}
          {player.imageUrl ? (
            <img
              src={player.imageUrl}
              alt={player.name}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-[var(--border)] group-hover:ring-[var(--primary)]/50 transition-all"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--secondary)] text-lg font-bold text-[var(--foreground-muted)] ring-2 ring-[var(--border)] group-hover:ring-[var(--primary)]/50 transition-all">
              {getInitials(player.name)}
            </div>
          )}

          {/* Info */}
          <div className="flex flex-1 flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors leading-tight">
                {player.name}
              </span>
              <span className="text-base" title={player.country}>
                {getFlag(player.country)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {player.category}
              </Badge>
              {player.worldRanking && (
                <span className="text-xs text-[var(--foreground-muted)]">
                  #{player.worldRanking}
                </span>
              )}
              {!player.isActive && (
                <Badge variant="outline" className="text-[10px] opacity-60">
                  Retired
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
