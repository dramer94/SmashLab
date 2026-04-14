import { Metadata } from "next"
import { getAllPlayers } from "@/lib/queries"
import { PlayerCard } from "@/components/player-card"

export const metadata: Metadata = {
  title: "Players",
  description: "All badminton players tracked on SmashLab. Malaysian players and their top international opponents.",
}

export default async function PlayersPage() {
  const players = await getAllPlayers()
  const malaysianPlayers = players.filter(p => p.country === 'MAS')
  const internationalPlayers = players.filter(p => p.country !== 'MAS')

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Players</h1>
      <p className="text-gray-400 mb-10">Browse player profiles, stats, and head-to-head records</p>

      {/* Malaysian Players */}
      <div className="mb-12">
        <h2 className="text-xl font-semibold text-blue-400 mb-4 flex items-center gap-2">
          <span className="text-2xl">{'\u{1F1F2}\u{1F1FE}'}</span> Malaysian Players
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {malaysianPlayers.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </div>
      </div>

      {/* International Players */}
      <div>
        <h2 className="text-xl font-semibold text-gray-300 mb-4">International Opponents</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {internationalPlayers.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </div>
      </div>
    </div>
  )
}
