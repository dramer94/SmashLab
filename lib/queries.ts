import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getFlag } from './utils'

export { getFlag }

export async function getMalaysianPlayers() {
  return prisma.slPlayer.findMany({
    where: { country: 'MAS', isActive: true },
    orderBy: [{ worldRanking: 'asc' }, { matchCount: 'desc' }, { name: 'asc' }],
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
      orderBy: [{ worldRanking: 'asc' }, { matchCount: 'desc' }, { name: 'asc' }],
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
    select: { country: true, name: true, worldRanking: true, matchCount: true },
  })

  const map = new Map<string, { count: number; topPlayer: string | null; topRanking: number | null; topMatchCount: number }>()

  for (const p of players) {
    if (!map.has(p.country)) {
      map.set(p.country, { count: 0, topPlayer: null, topRanking: null, topMatchCount: 0 })
    }
    const entry = map.get(p.country)!
    entry.count++
    // Prefer world-ranked player as "top player", fall back to most matches
    if (p.worldRanking && (!entry.topRanking || p.worldRanking < entry.topRanking)) {
      entry.topRanking = p.worldRanking
      entry.topPlayer = p.name
    } else if (!entry.topPlayer && p.matchCount > entry.topMatchCount) {
      entry.topMatchCount = p.matchCount
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

export async function getTournaments(year?: number) {
  return prisma.slTournament.findMany({
    where: year ? { year } : undefined,
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { matches: true } },
    },
  })
}

export async function getTournamentYears() {
  const result = await prisma.slTournament.findMany({
    select: { year: true },
    distinct: ['year'],
    orderBy: { year: 'desc' },
  })
  return result.map((r) => r.year)
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

// ── Stats / Records ──────────────────────────────────────────────

export async function getCareerMatchLeaders() {
  return prisma.slPlayer.findMany({
    where: { isActive: true, matchCount: { gte: 100 } },
    orderBy: { matchCount: 'desc' },
    take: 15,
    select: { id: true, name: true, slug: true, country: true, category: true, matchCount: true },
  })
}

export async function getCareerWinLeaders() {
  type WinRow = { id: string; name: string; slug: string; country: string; category: string; total: number; wins: number }
  const rows = await prisma.$queryRaw<WinRow[]>`
    SELECT p.id, p.name, p.slug, p.country, p.category,
      p."matchCount" as total,
      SUM(CASE WHEN m."winnerId" = p.id THEN 1 ELSE 0 END)::int as wins
    FROM sl_player p
    JOIN sl_match m ON (m."player1Id" = p.id OR m."player2Id" = p.id)
    WHERE p."matchCount" >= 100 AND m."winnerId" IS NOT NULL AND p."isActive" = true
    GROUP BY p.id, p.name, p.slug, p.country, p.category, p."matchCount"
    ORDER BY wins DESC
    LIMIT 15
  `
  return rows.map(r => ({ ...r, winRate: r.total > 0 ? Math.round((r.wins / r.total) * 100) : 0 }))
}

export async function getTitleLeaders() {
  type TitleRow = { id: string; name: string; slug: string; country: string; titles: number }
  return prisma.$queryRaw<TitleRow[]>`
    SELECT p.id, p.name, p.slug, p.country, COUNT(*)::int as titles
    FROM sl_match m
    JOIN sl_player p ON p.id = m."winnerId"
    WHERE m.round = 'F' AND m."winnerId" IS NOT NULL AND p."isActive" = true
    GROUP BY p.id, p.name, p.slug, p.country
    ORDER BY titles DESC
    LIMIT 15
  `
}

export async function getGreatestRivalries() {
  type RivalryRow = {
    pid1: string; pid2: string; matches: number
    name1: string; slug1: string; country1: string
    name2: string; slug2: string; country2: string
  }
  return prisma.$queryRaw<RivalryRow[]>`
    SELECT
      LEAST(m."player1Id", m."player2Id") as pid1,
      GREATEST(m."player1Id", m."player2Id") as pid2,
      COUNT(*)::int as matches,
      p1.name as name1, p1.slug as slug1, p1.country as country1,
      p2.name as name2, p2.slug as slug2, p2.country as country2
    FROM sl_match m
    JOIN sl_player p1 ON p1.id = LEAST(m."player1Id", m."player2Id")
    JOIN sl_player p2 ON p2.id = GREATEST(m."player1Id", m."player2Id")
    WHERE m."winnerId" IS NOT NULL
    GROUP BY LEAST(m."player1Id", m."player2Id"), GREATEST(m."player1Id", m."player2Id"),
      p1.name, p1.slug, p1.country, p2.name, p2.slug, p2.country
    ORDER BY matches DESC
    LIMIT 15
  `
}

export async function getCountryWins() {
  type CountryRow = { country: string; wins: number }
  return prisma.$queryRaw<CountryRow[]>`
    SELECT p.country, COUNT(*)::int as wins
    FROM sl_match m
    JOIN sl_player p ON p.id = m."winnerId"
    WHERE m."winnerId" IS NOT NULL
    GROUP BY p.country
    ORDER BY wins DESC
    LIMIT 20
  `
}

export type ExternalStatRow = {
  id: string; source: string; reportName: string; category: string
  headers: string[]; rows: { cells: string[] }[]
}

export async function getExternalStat(reportName: string, category = '%'): Promise<ExternalStatRow | null> {
  const rows = await prisma.$queryRaw<ExternalStatRow[]>`
    SELECT id, source, "reportName", category, headers, rows
    FROM sl_external_stat
    WHERE "reportName" = ${reportName}
      AND category = ${category}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getAllExternalStats(): Promise<ExternalStatRow[]> {
  return prisma.$queryRaw<ExternalStatRow[]>`
    SELECT id, source, "reportName", category, headers, rows
    FROM sl_external_stat
    ORDER BY source, "reportName", category
  `
}

export async function getMostWinsInAYear() {
  type Row = { id: string; name: string; slug: string; country: string; category: string; year: number; wins: number }
  return prisma.$queryRaw<Row[]>`
    SELECT p.id, p.name, p.slug, p.country, p.category,
      EXTRACT(YEAR FROM m.date)::int as year,
      COUNT(*)::int as wins
    FROM sl_match m
    JOIN sl_player p ON p.id = m."winnerId"
    WHERE m."winnerId" IS NOT NULL AND p."isActive" = true
    GROUP BY p.id, p.name, p.slug, p.country, p.category, EXTRACT(YEAR FROM m.date)
    HAVING COUNT(*) >= 20
    ORDER BY wins DESC
    LIMIT 15
  `
}

export async function getMostTitlesInAYear() {
  type Row = { id: string; name: string; slug: string; country: string; year: number; titles: number }
  return prisma.$queryRaw<Row[]>`
    SELECT p.id, p.name, p.slug, p.country,
      EXTRACT(YEAR FROM m.date)::int as year,
      COUNT(*)::int as titles
    FROM sl_match m
    JOIN sl_player p ON p.id = m."winnerId"
    WHERE m."winnerId" IS NOT NULL AND m.round = 'F' AND p."isActive" = true
    GROUP BY p.id, p.name, p.slug, p.country, EXTRACT(YEAR FROM m.date)
    HAVING COUNT(*) >= 5
    ORDER BY titles DESC
    LIMIT 15
  `
}

// ── Olympics ──────────────────────────────────────────────────────────────────

export async function getOlympicMedalTable() {
  type Row = { noc: string; gold: number; silver: number; bronze: number; total: number }
  return prisma.$queryRaw<Row[]>`
    SELECT noc,
      SUM(CASE WHEN medal = 'Gold' THEN 1 ELSE 0 END)::int as gold,
      SUM(CASE WHEN medal = 'Silver' THEN 1 ELSE 0 END)::int as silver,
      SUM(CASE WHEN medal = 'Bronze' THEN 1 ELSE 0 END)::int as bronze,
      SUM(CASE WHEN medal IN ('Gold','Silver','Bronze') THEN 1 ELSE 0 END)::int as total
    FROM sl_olympic_medal
    WHERE medal IS NOT NULL
    GROUP BY noc
    ORDER BY gold DESC, silver DESC, bronze DESC
  `
}

export async function getOlympicMedals(year?: number, discipline?: string) {
  type Row = { year: number; city: string; discipline: string; position: string; playerName: string; noc: string; medal: string }
  if (year && discipline) {
    return prisma.$queryRaw<Row[]>`
      SELECT year, city, discipline, position, "playerName", noc, medal
      FROM sl_olympic_medal
      WHERE year = ${year} AND discipline = ${discipline}
      ORDER BY position
    `
  }
  if (year) {
    return prisma.$queryRaw<Row[]>`
      SELECT year, city, discipline, position, "playerName", noc, medal
      FROM sl_olympic_medal WHERE year = ${year} ORDER BY discipline, position
    `
  }
  return prisma.$queryRaw<Row[]>`
    SELECT year, city, discipline, position, "playerName", noc, medal
    FROM sl_olympic_medal ORDER BY year DESC, discipline, position
  `
}

export async function getOlympicYears() {
  type Row = { year: number; city: string }
  return prisma.$queryRaw<Row[]>`
    SELECT DISTINCT year, city FROM sl_olympic_event ORDER BY year DESC
  `
}

export async function getOlympicMatches(year: number, discipline: string) {
  type Row = {
    round: string; player1Name: string; player1NOC: string
    player2Name: string; player2NOC: string; score: string
    winnerName: string; walkover: boolean
  }
  return prisma.$queryRaw<Row[]>`
    SELECT round, "player1Name", "player1NOC", "player2Name", "player2NOC",
      score, "winnerName", walkover
    FROM sl_olympic_match
    WHERE year = ${year} AND discipline = ${discipline}
    ORDER BY
      CASE round
        WHEN 'Group' THEN 1 WHEN 'R1' THEN 2 WHEN 'R32' THEN 3 WHEN 'R16' THEN 4
        WHEN 'QF' THEN 5 WHEN 'SF' THEN 6 WHEN 'Bronze' THEN 7 WHEN 'F' THEN 8
        ELSE 0 END
  `
}

export async function getThreeSetStats() {
  type ThreeSetRow = { category: string; total: number; three_set: number }
  return prisma.$queryRaw<ThreeSetRow[]>`
    SELECT
      category,
      COUNT(*)::int as total,
      SUM(CASE WHEN array_length(string_to_array(score, ' '), 1) >= 3 THEN 1 ELSE 0 END)::int as three_set
    FROM sl_match
    WHERE "walkover" = false AND score IS NOT NULL AND score != '' AND "winnerId" IS NOT NULL
    GROUP BY category
    ORDER BY category
  `
}

// ─── Generations ────────────────────────────────────────────────────────────────

export interface GenerationSummary {
  id: string
  slug: string
  country: string
  label: string
  birthYearStart: number | null
  birthYearEnd: number | null
  description: string | null
  displayOrder: number
  playerCount: number
  titles: number
  totalMatches: number
  activeStart: number | null
  activeEnd: number | null
  players: {
    id: string
    name: string
    slug: string
    country: string
    category: string
    worldRanking: number | null
    imageUrl: string | null
    isActive: boolean
    matchCount: number
    titles?: number
    wins?: number
    winRate?: number
  }[]
  disciplineStats?: {
    category: string
    playerCount: number
    titles: number
    totalMatches: number
    wins: number
    winRate: number
  }[]
}

// Shared CTE fragment that computes per-generation stats only for players
// who belong to at least one generation — avoids scanning all players.
async function fetchGenRows(whereClause: string, param?: string) {
  type GenRow = {
    id: string; slug: string; country: string; label: string
    birthYearStart: number | null; birthYearEnd: number | null
    description: string | null; displayOrder: number
    playerCount: number; titles: number; totalMatches: number
    activeStart: number | null; activeEnd: number | null
  }
  type PlayerRow = { id: string; name: string; slug: string; country: string; category: string; worldRanking: number | null; imageUrl: string | null; isActive: boolean; matchCount: number }

  // Single query: CTE computes per-player stats for only generation members
  const rows = param !== undefined
    ? await prisma.$queryRaw<GenRow[]>`
        WITH ps AS (
          SELECT
            p.id,
            p."matchCount",
            COUNT(CASE WHEN m.round = 'F' AND m."winnerId" = p.id THEN 1 END)::int AS titles,
            EXTRACT(YEAR FROM MIN(m.date))::int AS "activeStart",
            EXTRACT(YEAR FROM MAX(m.date))::int AS "activeEnd"
          FROM sl_player p
          JOIN sl_generation_player gp0 ON gp0."playerId" = p.id AND gp0."isPrimary" = true
          LEFT JOIN sl_match m ON m."player1Id" = p.id OR m."player2Id" = p.id
          GROUP BY p.id, p."matchCount"
        )
        SELECT
          g.id, g.slug, g.country, g.label,
          g."birthYearStart", g."birthYearEnd", g.description, g."displayOrder",
          COUNT(DISTINCT gp."playerId")::int        AS "playerCount",
          COALESCE(SUM(ps.titles), 0)::int          AS titles,
          COALESCE(SUM(ps."matchCount"), 0)::int    AS "totalMatches",
          MIN(ps."activeStart")::int                AS "activeStart",
          MAX(ps."activeEnd")::int                  AS "activeEnd"
        FROM sl_generation g
        JOIN sl_generation_player gp ON gp."generationId" = g.id AND gp."isPrimary" = true
        JOIN ps ON ps.id = gp."playerId"
        WHERE g.country = ${param}
        GROUP BY g.id, g.slug, g.country, g.label, g."birthYearStart", g."birthYearEnd", g.description, g."displayOrder"
        ORDER BY g."displayOrder" DESC, g."birthYearStart" DESC NULLS LAST
      `
    : await prisma.$queryRaw<GenRow[]>`
        WITH ps AS (
          SELECT
            p.id,
            p."matchCount",
            COUNT(CASE WHEN m.round = 'F' AND m."winnerId" = p.id THEN 1 END)::int AS titles,
            EXTRACT(YEAR FROM MIN(m.date))::int AS "activeStart",
            EXTRACT(YEAR FROM MAX(m.date))::int AS "activeEnd"
          FROM sl_player p
          JOIN sl_generation_player gp0 ON gp0."playerId" = p.id AND gp0."isPrimary" = true
          LEFT JOIN sl_match m ON m."player1Id" = p.id OR m."player2Id" = p.id
          GROUP BY p.id, p."matchCount"
        )
        SELECT
          g.id, g.slug, g.country, g.label,
          g."birthYearStart", g."birthYearEnd", g.description, g."displayOrder",
          COUNT(DISTINCT gp."playerId")::int        AS "playerCount",
          COALESCE(SUM(ps.titles), 0)::int          AS titles,
          COALESCE(SUM(ps."matchCount"), 0)::int    AS "totalMatches",
          MIN(ps."activeStart")::int                AS "activeStart",
          MAX(ps."activeEnd")::int                  AS "activeEnd"
        FROM sl_generation g
        JOIN sl_generation_player gp ON gp."generationId" = g.id AND gp."isPrimary" = true
        JOIN ps ON ps.id = gp."playerId"
        GROUP BY g.id, g.slug, g.country, g.label, g."birthYearStart", g."birthYearEnd", g.description, g."displayOrder"
        ORDER BY g.country, g."displayOrder" DESC, g."birthYearStart" DESC NULLS LAST
      `

  // Fetch top 6 players per generation
  const results: (GenRow & { players: PlayerRow[] })[] = []
  for (const row of rows) {
    const players = await prisma.$queryRaw<PlayerRow[]>`
      SELECT p.id, p.name, p.slug, p.country, p.category, p."worldRanking", p."imageUrl", p."isActive", p."matchCount"
      FROM sl_player p
      JOIN sl_generation_player gp ON gp."playerId" = p.id
      WHERE gp."generationId" = ${row.id} AND gp."isPrimary" = true
      ORDER BY p."matchCount" DESC
      LIMIT 6
    `
    results.push({ ...row, players })
  }
  return results
}

export async function getGenerations(country?: string): Promise<GenerationSummary[]> {
  return fetchGenRows('', country)
}

export async function getGenerationBySlug(slug: string): Promise<GenerationSummary | null> {
  const gens = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM sl_generation WHERE slug = ${slug} LIMIT 1
  `
  if (!gens[0]) return null
  const genId = gens[0].id

  type GenRow = {
    id: string; slug: string; country: string; label: string
    birthYearStart: number | null; birthYearEnd: number | null
    description: string | null; displayOrder: number
    playerCount: number; titles: number; totalMatches: number
    activeStart: number | null; activeEnd: number | null
  }
  const rows = await prisma.$queryRaw<GenRow[]>`
    WITH ps AS (
      SELECT
        p.id,
        p."matchCount",
        COUNT(CASE WHEN m.round = 'F' AND m."winnerId" = p.id THEN 1 END)::int AS titles,
        EXTRACT(YEAR FROM MIN(m.date))::int AS "activeStart",
        EXTRACT(YEAR FROM MAX(m.date))::int AS "activeEnd"
      FROM sl_player p
      JOIN sl_generation_player gp0 ON gp0."playerId" = p.id AND gp0."isPrimary" = true AND gp0."generationId" = ${genId}
      LEFT JOIN sl_match m ON m."player1Id" = p.id OR m."player2Id" = p.id
      GROUP BY p.id, p."matchCount"
    )
    SELECT
      g.id, g.slug, g.country, g.label,
      g."birthYearStart", g."birthYearEnd", g.description, g."displayOrder",
      COUNT(DISTINCT gp."playerId")::int        AS "playerCount",
      COALESCE(SUM(ps.titles), 0)::int          AS titles,
      COALESCE(SUM(ps."matchCount"), 0)::int    AS "totalMatches",
      MIN(ps."activeStart")::int                AS "activeStart",
      MAX(ps."activeEnd")::int                  AS "activeEnd"
    FROM sl_generation g
    JOIN sl_generation_player gp ON gp."generationId" = g.id AND gp."isPrimary" = true
    JOIN ps ON ps.id = gp."playerId"
    WHERE g.id = ${genId}
    GROUP BY g.id, g.slug, g.country, g.label, g."birthYearStart", g."birthYearEnd", g.description, g."displayOrder"
  `
  if (!rows[0]) return null

  // For detail page: get ALL players with individual titles + win rate
  type PlayerRow = {
    id: string; name: string; slug: string; country: string; category: string
    worldRanking: number | null; imageUrl: string | null; isActive: boolean; matchCount: number
    titles: number; wins: number; winRate: number
  }
  const allPlayers = await prisma.$queryRaw<PlayerRow[]>`
    SELECT
      p.id, p.name, p.slug, p.country, p.category,
      p."worldRanking", p."imageUrl", p."isActive", p."matchCount",
      COUNT(CASE WHEN m.round = 'F' AND m."winnerId" = p.id THEN 1 END)::int AS titles,
      COUNT(CASE WHEN m."winnerId" = p.id THEN 1 END)::int AS wins,
      CASE WHEN COUNT(m.id) > 0
        THEN ROUND(COUNT(CASE WHEN m."winnerId" = p.id THEN 1 END)::numeric / COUNT(m.id) * 100)::int
        ELSE 0 END AS "winRate"
    FROM sl_player p
    JOIN sl_generation_player gp ON gp."playerId" = p.id
    LEFT JOIN sl_match m ON (m."player1Id" = p.id OR m."player2Id" = p.id)
    WHERE gp."generationId" = ${genId} AND gp."isPrimary" = true
    GROUP BY p.id, p.name, p.slug, p.country, p.category, p."worldRanking", p."imageUrl", p."isActive", p."matchCount"
    ORDER BY p."matchCount" DESC
  `

  // Per-discipline aggregate stats
  type DisciplineStat = {
    category: string; playerCount: number; titles: number
    totalMatches: number; wins: number; winRate: number
  }
  const disciplineStats = await prisma.$queryRaw<DisciplineStat[]>`
    SELECT
      p.category,
      COUNT(DISTINCT p.id)::int                                                          AS "playerCount",
      SUM(COUNT(CASE WHEN m.round = 'F' AND m."winnerId" = p.id THEN 1 END)) OVER (PARTITION BY p.category)::int AS titles,
      SUM(COUNT(m.id)) OVER (PARTITION BY p.category)::int                              AS "totalMatches",
      SUM(COUNT(CASE WHEN m."winnerId" = p.id THEN 1 END)) OVER (PARTITION BY p.category)::int AS wins,
      CASE WHEN SUM(COUNT(m.id)) OVER (PARTITION BY p.category) > 0
        THEN ROUND(SUM(COUNT(CASE WHEN m."winnerId" = p.id THEN 1 END)) OVER (PARTITION BY p.category)::numeric
               / SUM(COUNT(m.id)) OVER (PARTITION BY p.category) * 100)::int
        ELSE 0 END AS "winRate"
    FROM sl_player p
    JOIN sl_generation_player gp ON gp."playerId" = p.id AND gp."generationId" = ${genId} AND gp."isPrimary" = true
    LEFT JOIN sl_match m ON (m."player1Id" = p.id OR m."player2Id" = p.id)
    GROUP BY p.category, p.id
    ORDER BY CASE p.category WHEN 'MS' THEN 1 WHEN 'WS' THEN 2 WHEN 'MD' THEN 3 WHEN 'WD' THEN 4 WHEN 'XD' THEN 5 END
  `

  // Collapse duplicate category rows from the window function approach
  const seenCats = new Set<string>()
  const disciplineStatsUniq = disciplineStats.filter(d => {
    if (seenCats.has(d.category)) return false
    seenCats.add(d.category)
    return true
  })

  return { ...rows[0], players: allPlayers, disciplineStats: disciplineStatsUniq }
}

export async function getPlayerGeneration(playerId: string): Promise<{ slug: string; label: string; country: string } | null> {
  const rows = await prisma.$queryRaw<{ slug: string; label: string; country: string }[]>`
    SELECT g.slug, g.label, g.country
    FROM sl_generation g
    JOIN sl_generation_player gp ON gp."generationId" = g.id
    WHERE gp."playerId" = ${playerId} AND gp."isPrimary" = true
    LIMIT 1
  `
  return rows[0] ?? null
}
