/**
 * Fixes matchCount for doubles players who appear as partner text but not as FK.
 * Uses a single bulk UPDATE instead of N+1 queries.
 *
 * Run: node --experimental-strip-types scripts/sync-partner-matchcounts.ts
 */

import { prisma } from '../lib/prisma.ts'

async function main() {
  console.log('SmashLab — Sync Partner Match Counts (bulk)')

  // Single UPDATE: recompute matchCount for all players who have partner appearances
  const result = await prisma.$executeRaw`
    UPDATE sl_player p
    SET "matchCount" = (
      SELECT COUNT(*)::int
      FROM sl_match m
      WHERE m."player1Id" = p.id
         OR m."player2Id" = p.id
         OR m."player1Partner" = p.name
         OR m."player2Partner" = p.name
    )
    WHERE EXISTS (
      SELECT 1 FROM sl_match m
      WHERE m."player1Partner" = p.name OR m."player2Partner" = p.name
    )
  `

  console.log(`Updated ${result} player records.`)

  // Verify Soh Wooi Yik
  const check = await prisma.$queryRaw<{ name: string; matchCount: number }[]>`
    SELECT name, "matchCount" FROM sl_player
    WHERE name = 'SOH Wooi Yik' OR LOWER(name) LIKE '%soh wooi%'
    LIMIT 3
  `
  console.log('Verification:', check)

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
