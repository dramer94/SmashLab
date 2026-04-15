/**
 * Seed Thomas / Uber / Sudirman Cup historical events and finishes from
 * scripts/data/team-cup-history.json. Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/seed-team-events.ts
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import path from 'path'

const prisma = new PrismaClient()

type Edition = {
  year: number
  host?: string
  champion: string
  runnerUp: string
  semifinalists: string[]
  quarterfinalists?: string[]
}

type History = {
  thomas: Edition[]
  uber: Edition[]
  sudirman: Edition[]
}

function finishFor(country: string, ed: Edition): string {
  if (country === ed.champion) return 'CHAMPION'
  if (country === ed.runnerUp) return 'RUNNER_UP'
  if (ed.semifinalists?.includes(country)) return 'SEMI_FINAL'
  if (ed.quarterfinalists?.includes(country)) return 'QUARTER_FINAL'
  return 'GROUP_STAGE'
}

async function seedEvent(type: 'THOMAS' | 'UBER' | 'SUDIRMAN', editions: Edition[]) {
  for (const ed of editions) {
    const event = await prisma.slTeamEvent.upsert({
      where: { type_year: { type, year: ed.year } },
      update: { host: ed.host },
      create: { type, year: ed.year, host: ed.host },
    })

    // Build the unique set of countries we know about for this edition.
    const countries = new Set<string>()
    countries.add(ed.champion)
    countries.add(ed.runnerUp)
    for (const c of ed.semifinalists || []) countries.add(c)
    for (const c of ed.quarterfinalists || []) countries.add(c)

    for (const country of countries) {
      await prisma.slTeamEventResult.upsert({
        where: {
          teamEventId_country: { teamEventId: event.id, country },
        },
        update: { finish: finishFor(country, ed) },
        create: {
          teamEventId: event.id,
          country,
          finish: finishFor(country, ed),
        },
      })
    }
    console.log(`  ${type} ${ed.year}: ${countries.size} countries recorded`)
  }
}

async function main() {
  const raw = readFileSync(
    path.join(process.cwd(), 'scripts', 'data', 'team-cup-history.json'),
    'utf8'
  )
  const history = JSON.parse(raw) as History

  console.log('Seeding Thomas Cup...')
  await seedEvent('THOMAS', history.thomas)
  console.log('Seeding Uber Cup...')
  await seedEvent('UBER', history.uber)
  console.log('Seeding Sudirman Cup...')
  await seedEvent('SUDIRMAN', history.sudirman)

  const [events, results] = await Promise.all([
    prisma.slTeamEvent.count(),
    prisma.slTeamEventResult.count(),
  ])
  console.log(`\n✅ Done. ${events} events, ${results} country-results in DB.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
