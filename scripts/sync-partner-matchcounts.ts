/**
 * Fixes matchCount for doubles players stored as partner text (player1Partner / player2Partner).
 * Uses a CTE UNION approach — far more efficient than correlated subqueries.
 *
 * Run: node --experimental-strip-types scripts/sync-partner-matchcounts.ts
 */

import { prisma } from '../lib/prisma.ts'

async function main() {
  console.log('SmashLab — Sync Partner Match Counts')

  // Step 1: Build complete participation counts via UNION (uses indexes, no correlated scan)
  const counts = await prisma.$queryRaw<{ player_id: string; total: number }[]>`
    WITH participations AS (
      SELECT "player1Id" AS player_id, id AS match_id FROM sl_match
      UNION ALL
      SELECT "player2Id", id FROM sl_match
      UNION ALL
      SELECT p.id, m.id
        FROM sl_match m
        JOIN sl_player p ON p.name = m."player1Partner"
        WHERE m."player1Partner" IS NOT NULL
      UNION ALL
      SELECT p.id, m.id
        FROM sl_match m
        JOIN sl_player p ON p.name = m."player2Partner"
        WHERE m."player2Partner" IS NOT NULL
    )
    SELECT player_id, COUNT(DISTINCT match_id)::int AS total
    FROM participations
    GROUP BY player_id
  `

  console.log(`Computed counts for ${counts.length} players.`)

  // Step 2: Bulk update only those whose count changed
  let updated = 0
  const BATCH = 100
  for (let i = 0; i < counts.length; i += BATCH) {
    const batch = counts.slice(i, i + BATCH)
    for (const row of batch) {
      await prisma.$executeRaw`
        UPDATE sl_player SET "matchCount" = ${row.total}
        WHERE id = ${row.player_id} AND "matchCount" != ${row.total}
      `
      updated++
    }
    process.stdout.write(`\r  Updated ${Math.min(i + BATCH, counts.length)}/${counts.length}...`)
  }

  console.log(`\nDone. Processed ${counts.length} players, ${updated} records updated.`)

  // Verify key players
  const check = await prisma.$queryRaw<{ name: string; matchCount: number }[]>`
    SELECT name, "matchCount" FROM sl_player
    WHERE name IN ('SOH Wooi Yik', 'Aaron CHIA', 'Pearly TAN', 'Muralitharan THINAAH')
    ORDER BY name
  `
  console.log('\nKey player verification:')
  check.forEach(p => console.log(`  ${p.name}: ${p.matchCount} matches`))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
