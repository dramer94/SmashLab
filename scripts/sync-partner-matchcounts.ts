/**
 * Fixes matchCount for doubles players who appear as partner text (player1Partner / player2Partner)
 * but are NOT linked as player1Id / player2Id in those matches.
 *
 * Root cause: the scraper stores one player per pair as the FK and the other partner as a name string.
 * This means e.g. SOH Wooi Yik shows only 15 matches (where he was the primary), while his
 * 443 matches as Aaron Chia's partner are invisible.
 *
 * Fix: UPDATE sl_player.matchCount = COUNT of all matches where the player appears
 *      either as a FK (player1Id / player2Id) OR as partner name text.
 *
 * Run: node --experimental-strip-types scripts/sync-partner-matchcounts.ts
 */

import { prisma } from '../lib/prisma.ts'

async function main() {
  console.log('SmashLab — Sync Partner Match Counts')
  console.log('Finding players with partner-text appearances...')

  // Get all players who appear as a partner name in at least one match
  const affected = await prisma.$queryRaw<{ id: string; name: string; oldCount: number }[]>`
    SELECT p.id, p.name, p."matchCount" AS "oldCount"
    FROM sl_player p
    WHERE EXISTS (
      SELECT 1 FROM sl_match m
      WHERE m."player1Partner" = p.name OR m."player2Partner" = p.name
    )
    ORDER BY p.name
  `

  console.log(`Found ${affected.length} players with uncounted partner appearances.\n`)

  let updated = 0
  let unchanged = 0

  for (const player of affected) {
    const [result] = await prisma.$queryRaw<{ real_count: number }[]>`
      SELECT COUNT(*)::int AS real_count
      FROM sl_match m
      WHERE m."player1Id" = ${player.id}
         OR m."player2Id" = ${player.id}
         OR m."player1Partner" = ${player.name}
         OR m."player2Partner" = ${player.name}
    `
    const realCount = result.real_count

    if (realCount !== player.oldCount) {
      await prisma.$executeRaw`
        UPDATE sl_player SET "matchCount" = ${realCount} WHERE id = ${player.id}
      `
      console.log(`  ✓ ${player.name}: ${player.oldCount} → ${realCount}`)
      updated++
    } else {
      unchanged++
    }
  }

  console.log(`\nDone. ${updated} updated, ${unchanged} already correct.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
