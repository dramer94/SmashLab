/**
 * Compute TeamScore + per-country squads for every team event edition.
 *
 * Runtime: ~one aggregated SQL query per (event × category) instead of
 * per-player, so full history finishes in seconds.
 *
 * Usage:
 *   npx tsx scripts/compute-team-scores.ts                # all events
 *   npx tsx scripts/compute-team-scores.ts --year 2024    # one year only
 */
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// A Thomas/Uber tie is decided by 5 rubbers: 3 singles + 2 doubles pairs.
// Sudirman ties play 5 rubbers across all 5 categories.
const SLOTS: Record<string, Array<{ category: string; n: number }>> = {
  THOMAS: [
    { category: 'MS', n: 3 },
    { category: 'MD', n: 2 },
  ],
  UBER: [
    { category: 'WS', n: 3 },
    { category: 'WD', n: 2 },
  ],
  SUDIRMAN: [
    { category: 'MS', n: 1 },
    { category: 'WS', n: 1 },
    { category: 'MD', n: 1 },
    { category: 'WD', n: 1 },
    { category: 'XD', n: 1 },
  ],
}

function windowFor(eventType: string, year: number, explicit?: Date | null): { start: Date; end: Date } {
  const end = explicit || new Date(Date.UTC(year, 4, 1))
  const start = new Date(end)
  start.setUTCFullYear(start.getUTCFullYear() - 1)
  return { start, end }
}

type RankedRow = { country: string; player_id: string; score: number; country_rnk: number; global_rnk: number }

/**
 * For one event window + category, return top-N players per country with
 * their score, intra-country rank, and global-rank-by-form (derived from
 * our own weighted-win score since BWF historical rankings aren't in the
 * DB). Single round-trip SQL.
 */
async function topPerCountry(
  category: string,
  n: number,
  start: Date,
  end: Date
): Promise<RankedRow[]> {
  return prisma.$queryRaw<RankedRow[]>(Prisma.sql`
    WITH player_scores AS (
      SELECT
        p.country AS country,
        m."winnerId" AS player_id,
        SUM(
          1 + CASE m.round
            WHEN 'F' THEN 2.0
            WHEN 'SF' THEN 1.5
            WHEN 'QF' THEN 1.2
            WHEN 'R16' THEN 1.0
            WHEN 'R32' THEN 0.8
            WHEN 'R64' THEN 0.6
            WHEN 'R128' THEN 0.4
            WHEN 'Group' THEN 0.6
            WHEN 'GS' THEN 0.6
            ELSE 0.5
          END
        )::float8 AS score
      FROM sl_match m
      JOIN sl_player p ON p.id = m."winnerId"
      WHERE m.category = ${category}
        AND m.date >= ${start}
        AND m.date < ${end}
      GROUP BY p.country, m."winnerId"
    ),
    ranked AS (
      SELECT
        country,
        player_id,
        score,
        ROW_NUMBER() OVER (PARTITION BY country ORDER BY score DESC) AS country_rnk,
        ROW_NUMBER() OVER (ORDER BY score DESC) AS global_rnk
      FROM player_scores
    )
    SELECT country, player_id, score, country_rnk::int AS country_rnk, global_rnk::int AS global_rnk
    FROM ranked
    WHERE country_rnk <= ${n}
  `)
}

async function main() {
  const yearArgIdx = process.argv.indexOf('--year')
  const yearFilter = yearArgIdx > 0 ? parseInt(process.argv[yearArgIdx + 1], 10) : null

  const events = await prisma.slTeamEvent.findMany({
    where: yearFilter ? { year: yearFilter } : {},
    include: { results: true },
    orderBy: [{ year: 'asc' }, { type: 'asc' }],
  })

  console.log(`Computing scores + squads for ${events.length} editions…`)

  for (const ev of events) {
    const { start, end } = windowFor(ev.type, ev.year, ev.startDate || null)
    const slots = SLOTS[ev.type] || []

    // Per-country totals across categories.
    const countryTotals = new Map<string, number>()
    // Persisted squad rows for this event.
    const squadRows: Array<{ country: string; playerId: string; category: string; slotRank: number; globalRank: number; bwfRank: number | null; score: number }> = []

    for (const slot of slots) {
      const ranked = await topPerCountry(slot.category, slot.n, start, end)
      for (const r of ranked) {
        countryTotals.set(r.country, (countryTotals.get(r.country) ?? 0) + Number(r.score))
        squadRows.push({
          country: r.country,
          playerId: r.player_id,
          category: slot.category,
          slotRank: Number(r.country_rnk),
          globalRank: Number(r.global_rnk),
          bwfRank: null, // filled below
          score: Number(r.score),
        })
      }
    }

    // Look up the latest SlRankingSnapshot strictly before the event's
    // start date for each squad player + category. Batch-query once for
    // all (category, playerId) pairs so this stays O(1) round-trip.
    const playerCats = Array.from(new Set(squadRows.map(s => `${s.category}:${s.playerId}`)))
    if (playerCats.length > 0) {
      type RankRow = { playerId: string; category: string; rank: number }
      const ranks = await prisma.$queryRaw<RankRow[]>(Prisma.sql`
        SELECT DISTINCT ON (rs."playerId", rs.category)
               rs."playerId", rs.category, rs.rank
        FROM sl_ranking_snapshot rs
        WHERE rs."snapshotDate" < ${end}
          AND (rs."playerId", rs.category) IN (
            ${Prisma.join(
              squadRows.map(s => Prisma.sql`(${s.playerId}, ${s.category})`)
            )}
          )
        ORDER BY rs."playerId", rs.category, rs."snapshotDate" DESC
      `)
      const rankByKey = new Map<string, number>()
      for (const r of ranks) rankByKey.set(`${r.category}:${r.playerId}`, r.rank)
      for (const s of squadRows) {
        s.bwfRank = rankByKey.get(`${s.category}:${s.playerId}`) ?? null
      }
    }

    // Replace squad rows for this event atomically.
    await prisma.$transaction([
      prisma.slTeamEventSquad.deleteMany({ where: { teamEventId: ev.id } }),
      prisma.slTeamEventSquad.createMany({
        data: squadRows.map(s => ({ teamEventId: ev.id, ...s })),
        skipDuplicates: true,
      }),
    ])

    for (const r of ev.results) {
      const score = countryTotals.get(r.country) ?? 0
      await prisma.slTeamEventResult.update({
        where: { id: r.id },
        data: { teamScore: score, computedAt: new Date() },
      })
    }

    console.log(`${ev.type} ${ev.year}: ${ev.results.length} countries, ${squadRows.length} squad slots`)
  }

  console.log('\n✅ Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
