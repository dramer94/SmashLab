/**
 * Compute TeamScore for every country at every Thomas/Uber/Sudirman edition.
 *
 * Formula:
 *   For each squad slot required by the event, pick the country's top
 *   players (by weighted wins in the 12 months before the event start) and
 *   sum their scores. Sudirman has 5 slots (1 MS, 1 WS, 1 MD, 1 WD, 1 XD);
 *   Thomas has 4 (2 MS, 2 MD); Uber has 4 (2 WS, 2 WD).
 *
 * Player score = sum of (1 + round weight) across wins in the window.
 * Round weights: F=2.0, SF=1.5, QF=1.2, R16=1.0, R32=0.8, Group=0.6.
 *
 * Usage:
 *   npx tsx scripts/compute-team-scores.ts                # all events
 *   npx tsx scripts/compute-team-scores.ts --year 2024    # one edition (all types)
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ROUND_WEIGHT: Record<string, number> = {
  F: 2.0, SF: 1.5, QF: 1.2, R16: 1.0, R32: 0.8, R64: 0.6, R128: 0.4,
  Group: 0.6, GS: 0.6,
}

// How many players per category count toward the team score.
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

function eventStartDate(type: string, year: number): Date {
  // Approximate start: Thomas/Uber/Sudirman are usually May. If the real
  // startDate is stored on the event row we prefer that.
  return new Date(Date.UTC(year, 4, 1))
}

async function scorePlayer(playerId: string, category: string, windowStart: Date, windowEnd: Date): Promise<number> {
  const wins = await prisma.slMatch.findMany({
    where: {
      category,
      winnerId: playerId,
      date: { gte: windowStart, lt: windowEnd },
    },
    select: { round: true },
  })
  return wins.reduce((sum, w) => sum + (1 + (ROUND_WEIGHT[w.round] ?? 0.5)), 0)
}

async function computeCountryScore(country: string, eventType: string, endDate: Date): Promise<number> {
  const startDate = new Date(endDate)
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 1)

  let total = 0
  for (const slot of SLOTS[eventType] || []) {
    // All of this country's players in this category.
    const players = await prisma.slPlayer.findMany({
      where: { country, category: slot.category, matchCount: { gt: 0 } },
      select: { id: true, name: true },
    })

    const scored: Array<{ playerId: string; name: string; score: number }> = []
    for (const p of players) {
      const s = await scorePlayer(p.id, slot.category, startDate, endDate)
      if (s > 0) scored.push({ playerId: p.id, name: p.name, score: s })
    }
    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, slot.n)
    for (const t of top) total += t.score
  }
  return total
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
    const endDate = ev.startDate || eventStartDate(ev.type, ev.year)
    console.log(`\n${ev.type} ${ev.year} (${ev.results.length} countries)`)

    for (const r of ev.results) {
      const score = await computeCountryScore(r.country, ev.type, endDate)
      await prisma.slTeamEventResult.update({
        where: { id: r.id },
        data: { teamScore: score, computedAt: new Date() },
      })
      console.log(`  ${r.country.padEnd(4)} ${r.finish.padEnd(14)} score=${score.toFixed(1)}`)
    }
  }

  console.log('\n✅ Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
