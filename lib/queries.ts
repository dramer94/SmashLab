import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

// Country code to flag emoji mapping
const countryFlags: Record<string, string> = {
  MAS: '🇲🇾', DEN: '🇩🇰', THA: '🇹🇭', CHN: '🇨🇳', INA: '🇮🇩',
  JPN: '🇯🇵', SGP: '🇸🇬', TPE: '🇹🇼', KOR: '🇰🇷', IND: '🇮🇳',
  ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', GER: '🇩🇪', FRA: '🇫🇷', AUS: '🇦🇺', CAN: '🇨🇦',
  USA: '🇺🇸', NED: '🇳🇱', HKG: '🇭🇰', VIE: '🇻🇳',
  PHI: '🇵🇭', MYA: '🇲🇲', SRI: '🇱🇰', PAK: '🇵🇰', BAN: '🇧🇩',
  NZL: '🇳🇿', RSA: '🇿🇦', ESP: '🇪🇸', SUI: '🇨🇭', SWE: '🇸🇪',
  POL: '🇵🇱', SCO: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', IRL: '🇮🇪', WAL: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', BEL: '🇧🇪',
  RUS: '🇷🇺', UKR: '🇺🇦', BUL: '🇧🇬', ROU: '🇷🇴', CZE: '🇨🇿',
  SVK: '🇸🇰', HUN: '🇭🇺', AUT: '🇦🇹', SLO: '🇸🇮', CRO: '🇭🇷',
  SRB: '🇷🇸', NOR: '🇳🇴', FIN: '🇫🇮', POR: '🇵🇹', ITA: '🇮🇹',
  GBR: '🇬🇧', MEX: '🇲🇽', BRA: '🇧🇷', ARG: '🇦🇷', CHI: '🇨🇱',
  PER: '🇵🇪', COL: '🇨🇴', ECU: '🇪🇨', GUA: '🇬🇹', PAN: '🇵🇦',
  MRI: '🇲🇺', NGR: '🇳🇬', KEN: '🇰🇪', EGY: '🇪🇬', TUN: '🇹🇳',
  MGL: '🇲🇳', KAZ: '🇰🇿', UZB: '🇺🇿', GEO: '🇬🇪', ARM: '🇦🇲',
  IRN: '🇮🇷', QAT: '🇶🇦', UAE: '🇦🇪', JOR: '🇯🇴', KUW: '🇰🇼',
}

export function getFlag(country: string): string {
  return countryFlags[country] || country
}

export async function getMalaysianPlayers() {
  return prisma.slPlayer.findMany({
    where: { country: 'MAS', isActive: true },
    orderBy: [{ worldRanking: 'asc' }, { name: 'asc' }],
    take: 12,
  })
}

export async function getAllPlayers() {
  return prisma.slPlayer.findMany({
    where: { isActive: true },
    orderBy: { worldRanking: 'asc' },
  })
}

export async function getAllPlayersGlobal(params: {
  country?: string
  category?: string
  search?: string
  page?: number
  limit?: number
} = {}) {
  const { country, category, search, page = 1, limit = 50 } = params

  const where: Prisma.SlPlayerWhereInput = {
    isActive: true,
    ...(country && { country }),
    ...(category && { category }),
    ...(search && {
      name: { contains: search, mode: 'insensitive' }
    }),
  }

  const [players, total] = await Promise.all([
    prisma.slPlayer.findMany({
      where,
      orderBy: [{ worldRanking: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.slPlayer.count({ where }),
  ])

  return { players, total, pages: Math.ceil(total / limit) }
}

export async function getCountrySummaries() {
  const players = await prisma.slPlayer.findMany({
    where: { isActive: true },
    select: { country: true, name: true, worldRanking: true },
  })

  const map = new Map<string, { count: number; topPlayer: string | null; topRanking: number | null }>()

  for (const p of players) {
    if (!map.has(p.country)) {
      map.set(p.country, { count: 0, topPlayer: null, topRanking: null })
    }
    const entry = map.get(p.country)!
    entry.count++
    if (p.worldRanking && (!entry.topRanking || p.worldRanking < entry.topRanking)) {
      entry.topRanking = p.worldRanking
      entry.topPlayer = p.name
    }
  }

  return Array.from(map.entries())
    .map(([country, data]) => ({ country, flag: getFlag(country), ...data }))
    .sort((a, b) => b.count - a.count)
}

export async function getPlayerBySlug(slug: string) {
  return prisma.slPlayer.findUnique({
    where: { slug },
  })
}

export async function getPlayerMatches(playerId: string, limit?: number) {
  return prisma.slMatch.findMany({
    where: {
      OR: [
        { player1Id: playerId },
        { player2Id: playerId },
      ],
    },
    include: {
      player1: true,
      player2: true,
      tournament: true,
    },
    orderBy: { date: 'desc' },
    take: limit,
  })
}

export async function getPlayerStats(playerId: string) {
  const matches = await prisma.slMatch.findMany({
    where: {
      OR: [
        { player1Id: playerId },
        { player2Id: playerId },
      ],
      winnerId: { not: null },
    },
    include: {
      tournament: true,
    },
  })

  const total = matches.length
  const wins = matches.filter(m => m.winnerId === playerId).length
  const losses = total - wins
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0

  // Stats by tournament level
  const byLevel: Record<string, { wins: number; losses: number }> = {}
  for (const match of matches) {
    const level = match.tournament.level
    if (!byLevel[level]) byLevel[level] = { wins: 0, losses: 0 }
    if (match.winnerId === playerId) byLevel[level].wins++
    else byLevel[level].losses++
  }

  // Stats by round
  const byRound: Record<string, { wins: number; losses: number }> = {}
  for (const match of matches) {
    const round = match.round
    if (!byRound[round]) byRound[round] = { wins: 0, losses: 0 }
    if (match.winnerId === playerId) byRound[round].wins++
    else byRound[round].losses++
  }

  // Finals record
  const finals = matches.filter(m => m.round === 'F')
  const finalsWins = finals.filter(m => m.winnerId === playerId).length
  const finalsLosses = finals.length - finalsWins

  return {
    total,
    wins,
    losses,
    winRate,
    byLevel,
    byRound,
    finals: { wins: finalsWins, losses: finalsLosses },
  }
}

export async function getPlayerH2HRecords(playerId: string) {
  const matches = await prisma.slMatch.findMany({
    where: {
      OR: [
        { player1Id: playerId },
        { player2Id: playerId },
      ],
      winnerId: { not: null },
    },
    include: {
      player1: true,
      player2: true,
      tournament: true,
    },
    orderBy: { date: 'desc' },
  })

  const h2hMap = new Map<string, {
    opponent: { id: string; name: string; slug: string; country: string }
    wins: number
    losses: number
    matches: typeof matches
  }>()

  for (const match of matches) {
    const isPlayer1 = match.player1Id === playerId
    const opponent = isPlayer1 ? match.player2 : match.player1
    const opponentId = opponent.id

    if (!h2hMap.has(opponentId)) {
      h2hMap.set(opponentId, {
        opponent: { id: opponent.id, name: opponent.name, slug: opponent.slug, country: opponent.country },
        wins: 0,
        losses: 0,
        matches: [],
      })
    }

    const record = h2hMap.get(opponentId)!
    if (match.winnerId === playerId) record.wins++
    else record.losses++
    record.matches.push(match)
  }

  return Array.from(h2hMap.values()).sort((a, b) => {
    const totalA = a.wins + a.losses
    const totalB = b.wins + b.losses
    return totalB - totalA
  })
}

export async function getFormTrend(playerId: string, lastN = 20) {
  const matches = await prisma.slMatch.findMany({
    where: {
      OR: [
        { player1Id: playerId },
        { player2Id: playerId },
      ],
      winnerId: { not: null },
    },
    include: {
      tournament: true,
    },
    orderBy: { date: 'asc' },
    take: lastN,
  })

  let runningWins = 0
  return matches.map((match, index) => {
    const won = match.winnerId === playerId
    if (won) runningWins++
    return {
      matchIndex: index + 1,
      date: match.date.toISOString(),
      tournament: match.tournament.name,
      round: match.round,
      won,
      winRate: Math.round((runningWins / (index + 1)) * 100),
    }
  })
}

export async function getH2HBetweenPlayers(player1Id: string, player2Id: string) {
  return prisma.slMatch.findMany({
    where: {
      OR: [
        { player1Id: player1Id, player2Id: player2Id },
        { player1Id: player2Id, player2Id: player1Id },
      ],
    },
    include: {
      player1: true,
      player2: true,
      tournament: true,
    },
    orderBy: { date: 'desc' },
  })
}

export async function getLatestMatches(limit = 10) {
  return prisma.slMatch.findMany({
    include: {
      player1: true,
      player2: true,
      tournament: true,
    },
    orderBy: { date: 'desc' },
    take: limit,
  })
}

export async function getSiteStats() {
  const [totalPlayers, malaysianPlayers, tournaments, matches, latestMatch] = await Promise.all([
    prisma.slPlayer.count({ where: { isActive: true } }),
    prisma.slPlayer.count({ where: { isActive: true, country: 'MAS' } }),
    prisma.slTournament.count(),
    prisma.slMatch.count(),
    prisma.slMatch.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
  ])

  return {
    totalPlayers,
    malaysianPlayers,
    tournaments,
    matches,
    latestMatchDate: latestMatch?.date ?? null,
  }
}

export async function getTournaments() {
  return prisma.slTournament.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { matches: true } },
    },
  })
}

export async function getTournamentBySlug(slug: string) {
  return prisma.slTournament.findUnique({
    where: { slug },
    include: {
      matches: {
        include: {
          player1: true,
          player2: true,
        },
        orderBy: [
          { date: 'asc' },
          { round: 'asc' },
        ],
      },
    },
  })
}
