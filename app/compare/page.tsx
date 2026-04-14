"use client"

import { useState, useEffect } from "react"

interface Player {
  id: string
  name: string
  slug: string
  country: string
  category: string
  worldRanking: number | null
  height: string | null
  playStyle: string | null
}

interface PlayerStats {
  total: number
  wins: number
  losses: number
  winRate: number
  finals: { wins: number; losses: number }
  byLevel: Record<string, { wins: number; losses: number }>
  byRound: Record<string, { wins: number; losses: number }>
}

interface PlayerData {
  player: Player
  stats: PlayerStats
}

const countryFlags: Record<string, string> = {
  MAS: '\u{1F1F2}\u{1F1FE}', DEN: '\u{1F1E9}\u{1F1F0}', THA: '\u{1F1F9}\u{1F1ED}',
  CHN: '\u{1F1E8}\u{1F1F3}', INA: '\u{1F1EE}\u{1F1E9}', JPN: '\u{1F1EF}\u{1F1F5}',
  SGP: '\u{1F1F8}\u{1F1EC}', TPE: '\u{1F1F9}\u{1F1FC}',
}

function StatRow({ label, v1, v2, highlight }: { label: string; v1: string | number; v2: string | number; highlight?: 'higher' | 'lower' }) {
  const n1 = typeof v1 === 'number' ? v1 : parseInt(String(v1))
  const n2 = typeof v2 === 'number' ? v2 : parseInt(String(v2))
  const compare = highlight === 'lower' ? n1 < n2 : n1 > n2
  const compare2 = highlight === 'lower' ? n2 < n1 : n2 > n1

  return (
    <div className="flex items-center py-3 border-b border-white/5">
      <div className={`flex-1 text-right text-lg font-mono ${!isNaN(n1) && !isNaN(n2) && compare ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
        {v1}
      </div>
      <div className="w-40 text-center text-sm text-gray-500 px-4">{label}</div>
      <div className={`flex-1 text-lg font-mono ${!isNaN(n1) && !isNaN(n2) && compare2 ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
        {v2}
      </div>
    </div>
  )
}

export default function ComparePage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [slug1, setSlug1] = useState("")
  const [slug2, setSlug2] = useState("")
  const [data1, setData1] = useState<PlayerData | null>(null)
  const [data2, setData2] = useState<PlayerData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch("/api/players/all")
      .then(r => r.json())
      .then(setPlayers)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (slug1) {
      fetch(`/api/players/${slug1}`).then(r => r.json()).then(setData1).catch(() => {})
    } else setData1(null)
  }, [slug1])

  useEffect(() => {
    if (slug2) {
      fetch(`/api/players/${slug2}`).then(r => r.json()).then(setData2).catch(() => {})
    } else setData2(null)
  }, [slug2])

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Compare Players</h1>
      <p className="text-gray-400 mb-8">Side-by-side stat comparison</p>

      {/* Player Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Player 1</label>
          <select
            value={slug1}
            onChange={e => setSlug1(e.target.value)}
            className="w-full bg-[var(--card)] border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Select player...</option>
            {players.map(p => (
              <option key={p.id} value={p.slug}>
                {countryFlags[p.country] || ''} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Player 2</label>
          <select
            value={slug2}
            onChange={e => setSlug2(e.target.value)}
            className="w-full bg-[var(--card)] border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Select player...</option>
            {players.map(p => (
              <option key={p.id} value={p.slug}>
                {countryFlags[p.country] || ''} {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data1 && data2 && (
        <div className="bg-[var(--card)] rounded-xl border border-white/10 p-6">
          {/* Player Names Header */}
          <div className="flex items-center mb-6">
            <div className="flex-1 text-right">
              <div className="text-xl font-bold text-white">{data1.player.name}</div>
              <div className="text-sm text-gray-400">{countryFlags[data1.player.country]} {data1.player.country}</div>
            </div>
            <div className="w-40 text-center text-gray-500 text-sm">VS</div>
            <div className="flex-1">
              <div className="text-xl font-bold text-white">{data2.player.name}</div>
              <div className="text-sm text-gray-400">{countryFlags[data2.player.country]} {data2.player.country}</div>
            </div>
          </div>

          <StatRow label="World Ranking" v1={data1.player.worldRanking ? `#${data1.player.worldRanking}` : 'N/A'} v2={data2.player.worldRanking ? `#${data2.player.worldRanking}` : 'N/A'} highlight="lower" />
          <StatRow label="Total Matches" v1={data1.stats.total} v2={data2.stats.total} highlight="higher" />
          <StatRow label="Wins" v1={data1.stats.wins} v2={data2.stats.wins} highlight="higher" />
          <StatRow label="Losses" v1={data1.stats.losses} v2={data2.stats.losses} highlight="lower" />
          <StatRow label="Win Rate" v1={`${data1.stats.winRate}%`} v2={`${data2.stats.winRate}%`} highlight="higher" />
          <StatRow label="Finals Won" v1={data1.stats.finals.wins} v2={data2.stats.finals.wins} highlight="higher" />
          <StatRow label="Finals Lost" v1={data1.stats.finals.losses} v2={data2.stats.finals.losses} highlight="lower" />
        </div>
      )}
    </div>
  )
}
