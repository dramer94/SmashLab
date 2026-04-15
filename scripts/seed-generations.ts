/**
 * Seeds hand-curated generations from scripts/data/generations.json into the DB.
 * Idempotent — safe to re-run. Manual overrides are never touched by compute-generations.ts.
 *
 * Usage: node --experimental-strip-types scripts/seed-generations.ts
 */

import { readFile } from 'node:fs/promises'
import { prisma } from '../lib/prisma.ts'

interface GenerationDef {
  slug: string
  country: string
  label: string
  birthYearStart?: number
  birthYearEnd?: number
  displayOrder?: number
  description?: string
  playerSlugs: string[]
}

interface GenerationsFile {
  generations: GenerationDef[]
}

function cuid() {
  // Simple cuid-like id using crypto
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
}

async function main() {
  const raw = await readFile(new URL('./data/generations.json', import.meta.url), 'utf8')
  const { generations }: GenerationsFile = JSON.parse(raw)

  console.log(`SmashLab — Seed Generations (${generations.length} definitions)`)

  let created = 0
  let updated = 0
  let playersLinked = 0
  let playersNotFound = 0

  for (const def of generations) {
    // Upsert generation record
    const existing = await prisma.$queryRaw<[{ id: string }?]>`
      SELECT id FROM sl_generation WHERE slug = ${def.slug} LIMIT 1
    `

    let genId: string

    if (existing[0]) {
      genId = existing[0].id
      await prisma.$executeRaw`
        UPDATE sl_generation SET
          country         = ${def.country},
          label           = ${def.label},
          "birthYearStart" = ${def.birthYearStart ?? null},
          "birthYearEnd"  = ${def.birthYearEnd ?? null},
          description     = ${def.description ?? null},
          "isManual"      = true,
          "displayOrder"  = ${def.displayOrder ?? 0}
        WHERE id = ${genId}
      `
      updated++
    } else {
      genId = cuid()
      await prisma.$executeRaw`
        INSERT INTO sl_generation (id, slug, country, label, "birthYearStart", "birthYearEnd", description, "isManual", "displayOrder")
        VALUES (
          ${genId}, ${def.slug}, ${def.country}, ${def.label},
          ${def.birthYearStart ?? null}, ${def.birthYearEnd ?? null},
          ${def.description ?? null}, true, ${def.displayOrder ?? 0}
        )
      `
      created++
    }

    // Link players by slug (fuzzy: try exact first, then startsWith)
    for (const playerSlug of def.playerSlugs) {
      // Try exact match first
      let players = await prisma.$queryRaw<[{ id: string; name: string }?]>`
        SELECT id, name FROM sl_player WHERE slug = ${playerSlug} LIMIT 1
      `

      // Fallback: prefix match (handles slugs with trailing -2 etc.)
      if (!players[0]) {
        players = await prisma.$queryRaw<[{ id: string; name: string }?]>`
          SELECT id, name FROM sl_player WHERE slug LIKE ${playerSlug + '%'} ORDER BY "matchCount" DESC LIMIT 1
        `
      }

      // Fallback: name-based match (strip hyphens → name fragments)
      if (!players[0]) {
        const namePart = playerSlug.replace(/-/g, ' ').replace(/\d+$/, '').trim()
        players = await prisma.$queryRaw<[{ id: string; name: string }?]>`
          SELECT id, name FROM sl_player
          WHERE LOWER(name) LIKE ${'%' + namePart + '%'}
          ORDER BY "matchCount" DESC LIMIT 1
        `
      }

      if (!players[0]) {
        console.log(`  ⚠ Not found: ${playerSlug}`)
        playersNotFound++
        continue
      }

      const playerId = players[0].id

      // Upsert generation_player (ON CONFLICT DO NOTHING for manual — never downgrade)
      await prisma.$executeRaw`
        INSERT INTO sl_generation_player (id, "generationId", "playerId", "isPrimary", "isManualOverride", confidence)
        VALUES (${cuid()}, ${genId}, ${playerId}, true, true, 'high')
        ON CONFLICT ("generationId", "playerId") DO UPDATE SET
          "isManualOverride" = true,
          "isPrimary"        = true,
          confidence         = 'high'
      `
      playersLinked++
    }

    const count = def.playerSlugs.length
    const found = def.playerSlugs.length - playersNotFound
    console.log(`  ${existing[0] ? '↺' : '+'} ${def.label} (${found}/${count} players linked)`)
    playersNotFound = 0  // reset per generation for per-gen reporting
  }

  const [genCount] = await prisma.$queryRaw<[{ n: number }]>`SELECT COUNT(*)::int as n FROM sl_generation WHERE "isManual" = true`
  const [linkCount] = await prisma.$queryRaw<[{ n: number }]>`SELECT COUNT(*)::int as n FROM sl_generation_player WHERE "isManualOverride" = true`

  console.log(`\nDone. +${created} created, ↺${updated} updated`)
  console.log(`DB: ${genCount.n} manual generations, ${linkCount.n} manually linked players`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
