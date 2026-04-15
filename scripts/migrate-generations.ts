/**
 * Creates sl_generation and sl_generation_player tables.
 * Safe to run multiple times (IF NOT EXISTS).
 *
 * Usage: node --experimental-strip-types scripts/migrate-generations.ts
 */

import { prisma } from '../lib/prisma.ts'

async function main() {
  console.log('Creating sl_generation and sl_generation_player tables...')

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS sl_generation (
      id              TEXT         NOT NULL PRIMARY KEY,
      slug            TEXT         NOT NULL UNIQUE,
      country         TEXT         NOT NULL,
      label           TEXT         NOT NULL,
      "birthYearStart" INTEGER,
      "birthYearEnd"  INTEGER,
      description     TEXT,
      "isManual"      BOOLEAN      NOT NULL DEFAULT false,
      "displayOrder"  INTEGER      NOT NULL DEFAULT 0,
      "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS sl_generation_country_idx ON sl_generation(country)
  `

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS sl_generation_player (
      id                  TEXT        NOT NULL PRIMARY KEY,
      "generationId"      TEXT        NOT NULL REFERENCES sl_generation(id) ON DELETE CASCADE,
      "playerId"          TEXT        NOT NULL REFERENCES sl_player(id) ON DELETE CASCADE,
      "isPrimary"         BOOLEAN     NOT NULL DEFAULT true,
      "cohortYearEst"     INTEGER,
      confidence          TEXT        NOT NULL DEFAULT 'high',
      "isManualOverride"  BOOLEAN     NOT NULL DEFAULT false,
      UNIQUE("generationId", "playerId")
    )
  `

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS sl_gen_player_gen_idx  ON sl_generation_player("generationId")
  `
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS sl_gen_player_play_idx ON sl_generation_player("playerId")
  `

  // Verify
  const [genCount] = await prisma.$queryRaw<[{ n: number }]>`
    SELECT COUNT(*)::int as n FROM sl_generation
  `
  console.log(`Done. sl_generation exists (${genCount.n} rows). Tables ready.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
