/**
 * Compute TeamScore for every country at every Thomas/Uber/Sudirman edition.
 *
 * Uses a single aggregate SQL per event+category to rank players inside each
 * country and sum the top-N per squad slot, so total runtime is ~1 query
 * per (event × category) combo instead of one query per player.
 *
 * Usage:
 *   npx tsx scripts/compute-team-scores.ts                # all events
 *   npx tsx scripts/compute-team-scores.ts --year 2024    # one year only
 */
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// How many top players per category count toward the team score.
const SLOTS: Record<string, Array<{ category: string; n: number }>> = {
  THOMAS: [
    { category: 'MS', n: 2 },
    { category: 'MD', n: 2 },
  ],
  UBER: [
    { category: 'WS', n: 2 },
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

type TopRow = { country: string; total: number }

/**
 * For one event window + category, pull every (country, player) score from
 * sl_match, then rank players inside each country and keep the top-N per
 * country. Returns a map country → total-of-top-N.
 */
async function topPerCountry(
  category: string,
  n: number,
  start: Date,
  end: Date
): Promise<Map<string, number>> {
  // Compute round-weighted wins per player in the window, then rank inside
  // each country and keep rows where rank <= n, then sum.
  const rows = await prisma.$queryRaw<TopRow[]>(Prisma.sql`
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
        ) AS score
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
        score,
        ROW_NUMBER() OVER (PARTITION BY country ORDER BY score DESC) AS rnk
      FROM player_scores
    )
    SELECT country, SUM(score)::float8 AS total
    FROM ranked
    WHERE rnk <= ${n}
    GROUP BY country
  `)

  const out = new Map<string, number>()
  for (const r of rows) out.set(r.country, Number(r.total))
  return out
}

async function main() {
  const yearArgIdx = process.argv.indexOf('--year')
  const yearFilter = yearArgIdx > 0 ? parseInt(process.argv[yearArgIdx + 1], 10) : null

  const events = await prisma.slTeamEvent.findMany({
    where: yearFilter ? { year: yearFilter } : {},
    include: { results: true },
    orderBy: [{ year: 'asc' }, { type: 'asc' }],
  })

  console.log(`Computing scores for ${events.length} event editions…`)

  for (const ev of events) {
    const { start, end } = windowFor(ev.type, ev.year, ev.startDate || null)
    const slots = SLOTS[ev.type] || []

    // For each category, fetch the top-N sum per country in one SQL.
    const perCategory: Map<string, number>[] = []
    for (const slot of slots) {
      const m = await topPerCountry(slot.category, slot.n, start, end)
      perCategory.push(m)
    }

    // Combine all categories into a per-country team score.
    const countryTotals = new Map<string, number>()
    for (const m of perCategory) {
      for (const [c, v] of m.entries()) {
        countryTotals.set(c, (countryTotals.get(c) ?? 0) + v)
      }
    }

    // Write each result row (countries without any matches in the window
    // get 0, not null, so the UI can still sort them).
    for (const r of ev.results) {
      const score = countryTotals.get(r.country) ?? 0
      await prisma.slTeamEventResult.update({
        where: { id: r.id },
        data: { teamScore: score, computedAt: new Date() },
      })
    }
    console.log(`${ev.type} ${ev.year}: scored ${ev.results.length} countries`)
  }

  console.log('\n✅ Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
