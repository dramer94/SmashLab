"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { formatDate } from "@/lib/utils"

interface Player {
  id: string
  name: string
  slug: string
  country: string
  category: string
  worldRanking: number | null
}

interface Match {
  id: string
  round: string
  date: string
  score: string
  winnerId: string | null
  player1Partner: string | null
  player2Partner: string | null
  tournament: { name: string; level: string }
  player1: Player
  player2: Player
}

interface H2HData {
  player1: Player
  player2: Player
  matches: Match[]
  summary: { player1Wins: number; player2Wins: number; total: number }
}

const countryFlags: Record<string, string> = {
  MAS: '\u{1F1F2}\u{1F1FE}', DEN: '\u{1F1E9}\u{1F1F0}', THA: '\u{1F1F9}\u{1F1ED}',
  CHN: '\u{1F1E8}\u{1F1F3}', INA: '\u{1F1EE}\u{1F1E9}', JPN: '\u{1F1EF}\u{1F1F5}',
  SGP: '\u{1F1F8}\u{1F1EC}', TPE: '\u{1F1F9}\u{1F1FC}',
}

export function HeadToHeadClient() {
  const searchParams = useSearchParams()
  const [players, setPlayers] = useState<Player[]>([])
  const [player1Slug, setPlayer1Slug] = useState(searchParams.get("p1") || "")
  const [player2Slug, setPlayer2Slug] = useState(searchParams.get("p2") || "")
  const [data, setData] = useState<H2HData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch("/api/players/all")
      .then(r => r.json())
      .then(setPlayers)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (player1Slug && player2Slug && player1Slug !== player2Slug) {
      setLoading(true)
      fetch(`/api/head-to-head?p1=${player1Slug}&p2=${player2Slug}`)
        .then(r => r.json())
        .then(d => { setData(d); setLoading(false) })
        .catch(() => setLoading(false))
    }
  }, [player1Slug, player2Slug])

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Head-to-Head</h1>
      <p className="text-gray-400 mb-8">Compare the rivalry between any two players</p>

      {/* Player Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Player 1</label>
          <select
            value={player1Slug}
            onChange={e => setPlayer1Slug(e.target.value)}
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
            value={player2Slug}
            onChange={e => setPlayer2Slug(e.target.value)}
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

      {loading && (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      )}

      {data && !loading && (
        <>
          {/* Summary */}
          <div className="bg-[var(--card)] rounded-xl border border-white/10 p-8 mb-8">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="text-2xl font-bold text-white">{data.player1.name}</div>
                <div className="text-sm text-gray-400">{countryFlags[data.player1.country]} {data.player1.country}</div>
              </div>
              <div className="text-center px-8">
                <div className="flex items-center gap-3">
                  <span className={`text-4xl font-bold ${data.summary.player1Wins > data.summary.player2Wins ? 'text-green-400' : 'text-white'}`}>
                    {data.summary.player1Wins}
                  </span>
                  <span className="text-2xl text-gray-500">-</span>
                  <span className={`text-4xl font-bold ${data.summary.player2Wins > data.summary.player1Wins ? 'text-green-400' : 'text-white'}`}>
                    {data.summary.player2Wins}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{data.summary.total} matches</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-2xl font-bold text-white">{data.player2.name}</div>
                <div className="text-sm text-gray-400">{countryFlags[data.player2.country]} {data.player2.country}</div>
              </div>
            </div>
          </div>

          {/* Match History */}
          <div className="bg-[var(--card)] rounded-xl border border-white/10">
            <div className="p-6 pb-2">
              <h2 className="text-lg font-semibold text-white">Match History</h2>
            </div>
            <div className="divide-y divide-white/5">
              {data.matches.map((match) => {
                const p1Won = match.winnerId === data.player1.id
                return (
                  <div key={match.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="flex-1 text-right">
                      <span className={p1Won ? 'text-green-400 font-semibold' : 'text-gray-400'}>
                        {match.player1.name === data.player1.name ? data.player1.name : data.player2.name}
                        {match.player1Partner && ` / ${match.player1Partner}`}
                      </span>
                    </div>
                    <div className="text-center min-w-[100px]">
                      <div className="text-white font-mono text-sm">{match.score}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {match.tournament.name} &middot; {match.round}
                      </div>
                      <div className="text-xs text-gray-600">{formatDate(match.date)}</div>
                    </div>
                    <div className="flex-1">
                      <span className={!p1Won ? 'text-green-400 font-semibold' : 'text-gray-400'}>
                        {match.player1.name === data.player1.name ? data.player2.name : data.player1.name}
                        {match.player2Partner && ` / ${match.player2Partner}`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {!data && !loading && player1Slug && player2Slug && player1Slug === player2Slug && (
        <div className="text-center py-12 text-gray-500">Please select two different players</div>
      )}
    </div>
  )
}
