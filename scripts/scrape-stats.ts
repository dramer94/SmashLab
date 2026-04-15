/**
 * Scrapes all Stats, HOF, and Records data from badmintonstatistics.net
 * and stores them in sl_external_stat table.
 *
 * Usage: node --experimental-strip-types scripts/scrape-stats.ts
 */

import { prisma } from '../lib/prisma.ts'

const BASE = 'https://www.badmintonstatistics.net'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
  'Referer': BASE,
}
const DELAY = 4000

const CATEGORIES = ['%', 'MS', 'WS', 'MD', 'WD', 'XD']

// ── All report types ──────────────────────────────────────────────────────────
const REPORTS: { name: string; displayName: string; level?: string; year?: string }[] = [
  { name: 'PlayerWinsAndLosses',                      displayName: 'Wins And Losses',                        level: 'worldtour', year: '-1' },
  // { name: 'TournamenWinnersStatsMaster', ... }  // always 500s — skip
  { name: 'FirstSetWins',                              displayName: 'Results After Winning First Set',        level: 'worldtour', year: '-1' },
  { name: 'FirstSetLosses',                            displayName: 'Results After Losing First Set',         level: 'worldtour', year: '-1' },
  { name: 'MostPointsH2H',                             displayName: 'Points H2H',                            level: 'worldtour', year: '-1' },
  { name: 'PerformanceFollowingWorldChampionship',     displayName: 'Performance After WC Win',               level: 'worldtour', year: '-1' },
  { name: 'MostCalendarYearsWithFinal',                displayName: 'Most Calendar Years With Finals',        level: 'worldtour', year: '-1' },
  { name: 'WeeksInTop10Ranking',                       displayName: 'Weeks in Top-10',                       level: 'worldtour', year: '-1' },
  { name: 'MostConsecutiveWeeksTop10BWFRanking',       displayName: 'Consecutive Weeks in Top-10',           level: 'worldtour', year: '-1' },
  { name: 'finalsmatches',                             displayName: 'Finals Matches',                        level: 'worldtour', year: '-1' },
  { name: 'ThreeSetPercentages',                       displayName: '3-Set Percentages',                     level: 'worldtour', year: '-1' },
]

// ── All HOF records ───────────────────────────────────────────────────────────
const HOF_RECORDS: { name: string; displayName: string }[] = [
  // Oldest & Youngest
  { name: 'OldestSuperSeriesWinner',             displayName: 'Oldest Superseries Winner' },
  { name: 'YoungestSuperseriesWinner',           displayName: 'Youngest Superseries Winner' },
  { name: 'OldestWorldChampion',                 displayName: 'Oldest World Champions' },
  { name: 'YoungestWorldChampion',               displayName: 'Youngest World Champions' },
  { name: 'YoungestWorldNoOne',                  displayName: 'Youngest World No 1 (BWF)' },
  { name: 'YoungestWorldNoOneUnified',           displayName: 'Youngest World No 1 (Unified)' },
  { name: 'OldestWorldNoOne',                    displayName: 'Oldest World No 1 (BWF)' },
  { name: 'OldestWorldNoOneUnified',             displayName: 'Oldest World No 1 (Unified)' },
  // Points Records
  { name: 'BiggestComebackInASet',               displayName: 'Biggest Comeback in a Set' },
  { name: 'BiggestComebackFromSetDownHOF',       displayName: 'Biggest Comeback After Losing 1st Set' },
  // Match Records
  { name: 'BestWinPCTByPairAndYearModern',       displayName: 'Best Winning % in a Year (Modern Era)' },
  { name: 'BestWinPCTByPairAndYearAllTime',      displayName: 'Best Winning % in a Year (All Time)' },
  { name: 'LongestWinningStreakAllTime',          displayName: 'Longest Winning Streaks (No Walkovers)' },
  { name: 'MostMatchWinsInAYear',                displayName: 'Most Match Wins in a Year' },
  { name: 'MostWorldTourMeetings',               displayName: 'Most World Tour Matchups' },
  { name: 'BestRecordAgainstAnOpponent',         displayName: 'Best H2H Records' },
  { name: 'WinStreakSSFinals',                   displayName: 'Longest Winning Streak (Superseries Final)' },
  { name: 'LongestWinningStreakAllTimeWithWalkovers', displayName: 'Longest Winning Streaks (With Walkovers)' },
  // Tournament Records
  { name: 'MostWorldChampionships',              displayName: 'Most World Championships' },
  { name: 'MostWinsOfTournament',                displayName: 'Most Wins of a SS Tournament' },
  { name: 'MostTournamentWinsInAYear',           displayName: 'Most Tournament Wins in a Year' },
  { name: 'MostSuperSeriesWins',                 displayName: 'Most Superseries Wins' },
  { name: 'MostSuperSeriesFinals',               displayName: 'Most Superseries Finals' },
  { name: 'MostSuperSeriesSemifinals',           displayName: 'Most Superseries Semi-finals' },
  { name: 'MostYearsWinning5Tournaments',        displayName: 'Most Years Winning 5+ Tournaments' },
  { name: 'MostConsecutiveSuperseriesWins',      displayName: 'Most Consecutive Wins' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) { console.warn(`  ✗ ${res.status} ${url}`); return null }
    return await res.text()
  } catch (e) {
    console.warn(`  ✗ fetch error ${url}: ${e}`)
    return null
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2B;/g, '+').replace(/\s+/g, ' ').trim()
}

function parseTable(html: string): { headers: string[]; rows: { cells: string[] }[] } | null {
  const tableMatch = html.match(/<table[^>]*class="reportTable"[^>]*>([\s\S]*?)<\/table>/i)
  if (!tableMatch) return null
  const tableHtml = tableMatch[1]

  // Headers
  const theadMatch = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/i)
  const headers: string[] = []
  if (theadMatch) {
    const thMatches = [...theadMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
    for (const m of thMatches) {
      headers.push(stripHtml(m[1]).replace(/[▼▲]/g, '').trim())
    }
  }

  // Rows
  const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i)
  const rows: { cells: string[] }[] = []
  if (tbodyMatch) {
    const trMatches = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    for (const tr of trMatches) {
      const tdMatches = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      const cells = tdMatches.map(td => stripHtml(td[1]))
      if (cells.length > 0) rows.push({ cells })
    }
  }

  return headers.length > 0 || rows.length > 0 ? { headers, rows } : null
}

async function upsertStat(params: {
  source: string
  reportName: string
  category: string
  level: string
  year: string
  headers: string[]
  rows: { cells: string[] }[]
}) {
  await prisma.$executeRaw`
    INSERT INTO sl_external_stat (id, source, "reportName", category, level, year, headers, rows, "scrapedAt")
    VALUES (
      gen_random_uuid()::text,
      ${params.source},
      ${params.reportName},
      ${params.category},
      ${params.level},
      ${params.year},
      ${params.headers},
      ${JSON.stringify(params.rows)}::jsonb,
      NOW()
    )
    ON CONFLICT ("reportName", category, level, year)
    DO UPDATE SET
      headers = EXCLUDED.headers,
      rows = EXCLUDED.rows,
      "scrapedAt" = NOW()
  `
}

// ── Reports ───────────────────────────────────────────────────────────────────

async function scrapeReports() {
  console.log('\n── Scraping Reports ──────────────────────────────')
  for (const report of REPORTS) {
    for (const cat of CATEGORIES) {
      const url = `${BASE}/home/ReportPartial?reportname=${report.name}&category=${encodeURIComponent(cat)}&year=${report.year ?? '-1'}&level=${report.level ?? 'worldtour'}&country=%25`
      process.stdout.write(`  ${report.displayName} [${cat === '%' ? 'ALL' : cat}]... `)
      const html = await fetchHtml(url)
      if (!html) { console.log('skip'); await sleep(DELAY); continue }
      const parsed = parseTable(html)
      if (!parsed) { console.log('no table'); await sleep(DELAY); continue }
      await upsertStat({
        source: 'Reports',
        reportName: report.name,
        category: cat,
        level: report.level ?? 'worldtour',
        year: report.year ?? '-1',
        headers: parsed.headers,
        rows: parsed.rows,
      })
      console.log(`${parsed.rows.length} rows`)
      await sleep(DELAY)
    }
  }
}

// ── HOF ───────────────────────────────────────────────────────────────────────

async function scrapeHOF() {
  console.log('\n── Scraping HOF ──────────────────────────────────')
  for (const record of HOF_RECORDS) {
    for (const cat of CATEGORIES) {
      const url = `${BASE}/home/HOFPartial?reportname=${record.name}&category=${encodeURIComponent(cat)}`
      process.stdout.write(`  ${record.displayName} [${cat === '%' ? 'ALL' : cat}]... `)
      const html = await fetchHtml(url)
      if (!html) { console.log('skip'); await sleep(DELAY); continue }
      const parsed = parseTable(html)
      if (!parsed || parsed.rows.length === 0) { console.log('empty'); await sleep(DELAY); continue }
      await upsertStat({
        source: 'HOF',
        reportName: record.name,
        category: cat,
        level: 'worldtour',
        year: '-1',
        headers: parsed.headers,
        rows: parsed.rows,
      })
      console.log(`${parsed.rows.length} rows`)
      await sleep(DELAY)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('SmashLab — External Stats Scraper')
  console.log(`Scraping ${REPORTS.length} report types × ${CATEGORIES.length} categories`)
  console.log(`+ ${HOF_RECORDS.length} HOF records × ${CATEGORIES.length} categories`)

  await scrapeReports()
  await scrapeHOF()

  const count = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) FROM sl_external_stat`
  console.log(`\nDone. ${count[0].count} stat records in DB.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
