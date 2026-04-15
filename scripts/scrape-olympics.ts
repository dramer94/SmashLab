/**
 * Scrapes all Olympic badminton results from olympedia.org (1992–2024).
 * Respects their 10-second crawl delay.
 *
 * Usage: node --experimental-strip-types scripts/scrape-olympics.ts
 */

import { prisma } from '../lib/prisma.ts'

const BASE = 'https://www.olympedia.org'
const DELAY = 10500   // 10.5s — respects olympedia robots.txt crawl-delay: 10

const CITIES: Record<number, string> = {
  1992: 'Barcelona', 1996: 'Atlanta', 2000: 'Sydney',
  2004: 'Athens', 2008: 'Beijing', 2012: 'London',
  2016: 'Rio', 2020: 'Tokyo', 2024: 'Paris',
}

// All Olympic badminton event result URLs from olympedia.org
const EVENTS: { year: number; discipline: string; resultId: number }[] = [
  // Men's Singles
  { year: 1992, discipline: 'MS', resultId: 42000 },
  { year: 1996, discipline: 'MS', resultId: 42214 },
  { year: 2000, discipline: 'MS', resultId: 42470 },
  { year: 2004, discipline: 'MS', resultId: 42726 },
  { year: 2008, discipline: 'MS', resultId: 257994 },
  { year: 2012, discipline: 'MS', resultId: 304000 },
  { year: 2016, discipline: 'MS', resultId: 351550 },
  { year: 2020, discipline: 'MS', resultId: 19005200 },
  { year: 2024, discipline: 'MS', resultId: 2005600 },
  // Women's Singles
  { year: 1992, discipline: 'WS', resultId: 42107 },
  { year: 1996, discipline: 'WS', resultId: 42323 },
  { year: 2000, discipline: 'WS', resultId: 42579 },
  { year: 2004, discipline: 'WS', resultId: 42802 },
  { year: 2008, discipline: 'WS', resultId: 258065 },
  { year: 2012, discipline: 'WS', resultId: 304111 },
  { year: 2016, discipline: 'WS', resultId: 351671 },
  { year: 2020, discipline: 'WS', resultId: 19005318 },
  { year: 2024, discipline: 'WS', resultId: 2005717 },
  // Men's Doubles
  { year: 1992, discipline: 'MD', resultId: 42070 },
  { year: 1996, discipline: 'MD', resultId: 42285 },
  { year: 2000, discipline: 'MD', resultId: 42541 },
  { year: 2004, discipline: 'MD', resultId: 42764 },
  { year: 2008, discipline: 'MD', resultId: 258136 },
  { year: 2012, discipline: 'MD', resultId: 304070 },
  { year: 2016, discipline: 'MD', resultId: 351630 },
  { year: 2020, discipline: 'MD', resultId: 19005277 },
  { year: 2024, discipline: 'MD', resultId: 2005676 },
  // Women's Doubles
  { year: 1992, discipline: 'WD', resultId: 42177 },
  { year: 1996, discipline: 'WD', resultId: 42394 },
  { year: 2000, discipline: 'WD', resultId: 42650 },
  { year: 2004, discipline: 'WD', resultId: 42840 },
  { year: 2008, discipline: 'WD', resultId: 258157 },
  { year: 2012, discipline: 'WD', resultId: 304193 },
  { year: 2016, discipline: 'WD', resultId: 351748 },
  { year: 2020, discipline: 'WD', resultId: 19005395 },
  { year: 2024, discipline: 'WD', resultId: 2005798 },
  // Mixed Doubles (debuted 1996)
  { year: 1996, discipline: 'XD', resultId: 42432 },
  { year: 2000, discipline: 'XD', resultId: 42688 },
  { year: 2004, discipline: 'XD', resultId: 42878 },
  { year: 2008, discipline: 'XD', resultId: 258178 },
  { year: 2012, discipline: 'XD', resultId: 304234 },
  { year: 2016, discipline: 'XD', resultId: 351789 },
  { year: 2020, discipline: 'XD', resultId: 19005436 },
  { year: 2024, discipline: 'XD', resultId: 2005839 },
]

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim()
}

// Parse all tables from an HTML page
function parseTables(html: string): { headers: string[]; rows: string[][] }[] {
  const tables: { headers: string[]; rows: string[][] }[] = []
  const tableRx = /<table[^>]*>([\s\S]*?)<\/table>/gi
  let tm: RegExpExecArray | null
  while ((tm = tableRx.exec(html)) !== null) {
    const tHtml = tm[1]
    const rows: string[][] = []
    const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rm: RegExpExecArray | null
    while ((rm = rowRx.exec(tHtml)) !== null) {
      const cells: string[] = []
      const cellRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
      let cm: RegExpExecArray | null
      while ((cm = cellRx.exec(rm[1])) !== null) {
        cells.push(stripTags(cm[1]))
      }
      if (cells.length > 0) rows.push(cells)
    }
    if (rows.length > 0) {
      tables.push({ headers: rows[0], rows: rows.slice(1) })
    }
  }
  return tables
}

// Detect round name from header table text
function detectRound(headerText: string): string {
  const t = headerText.toLowerCase()
  if (t.includes('final') && (t.includes('bronze') || t.includes('3/4'))) return 'Bronze'
  if (t.includes('final') && !t.includes('semi') && !t.includes('quarter')) return 'F'
  if (t.includes('semi')) return 'SF'
  if (t.includes('quarter')) return 'QF'
  if (t.includes('round of 16') || t.includes('round two') || t.includes('second round') || t.includes('r16')) return 'R16'
  if (t.includes('round of 32') || t.includes('third round') || t.includes('r32')) return 'R32'
  if (t.includes('group')) return 'Group'
  if (t.includes('round one') || t.includes('first round')) return 'R1'
  if (t.includes('knock') || t.includes('eliminat')) return 'R16'
  return 'Group'
}

// Is this a match result table? (has "Competitor"/"Pair" and "Result" columns)
function isMatchTable(headers: string[]): boolean {
  const joined = headers.join(' ').toLowerCase()
  return joined.includes('result') && (joined.includes('competitor') || joined.includes('pair'))
}

// Is this a medal/standings table? (has "Pos" and "Competitor"/"Pair" and "NOC")
function isMedalTable(headers: string[]): boolean {
  const joined = headers.join(' ').toLowerCase()
  return joined.includes('pos') && (joined.includes('competitor') || joined.includes('pair')) && joined.includes('noc') && !joined.includes('result')
}

// Parse a match row → { p1Name, p1NOC, score, p2Name, p2NOC, walkover }
function parseMatchRow(row: string[]): {
  p1Name: string; p1NOC: string; score: string; p2Name: string; p2NOC: string; walkover: boolean
} | null {
  // Match tables have: Match# | Date | Competitor | NOC | Result | Competitor | NOC
  // Sometimes: Match# | Date/Time | Competitor | NOC | Result | Competitor | NOC
  if (row.length < 5) return null

  // Find the result cell (contains score like "21-15, 21-11" or "walkover")
  let scoreIdx = -1
  for (let i = 1; i < row.length; i++) {
    const c = row[i]
    if (/\d+-\d+/.test(c) || /walkover/i.test(c) || /retired/i.test(c) || /w\/o/i.test(c)) {
      scoreIdx = i
      break
    }
  }
  if (scoreIdx < 0) return null

  // Players are before and after the score
  // Pattern: [..., p1Name, p1NOC, score, p2Name, p2NOC]
  // The NOC is a 2-3 letter uppercase code
  const isNOC = (s: string) => /^[A-Z]{2,3}$/.test(s.trim())

  let p1Name = '', p1NOC = '', p2Name = '', p2NOC = ''
  const score = row[scoreIdx]
  const walkover = /walkover|w\/o/i.test(score)

  // Look backwards from score for p1NOC and p1Name
  if (scoreIdx >= 2 && isNOC(row[scoreIdx - 1])) {
    p1NOC = row[scoreIdx - 1]
    p1Name = row[scoreIdx - 2]
  } else if (scoreIdx >= 1) {
    // NOC might be merged or missing
    p1Name = row[scoreIdx - 1]
  }

  // Look forwards from score for p2Name and p2NOC
  if (scoreIdx + 2 < row.length && isNOC(row[scoreIdx + 2])) {
    p2Name = row[scoreIdx + 1]
    p2NOC = row[scoreIdx + 2]
  } else if (scoreIdx + 1 < row.length) {
    p2Name = row[scoreIdx + 1]
  }

  // Strip seed annotations like "(1)", "(2)" from player/pair names
  p1Name = p1Name.replace(/\s*\(\d+\)\s*$/, '').trim()
  p2Name = p2Name.replace(/\s*\(\d+\)\s*$/, '').trim()

  if (!p1Name || !p2Name) return null
  return { p1Name, p1NOC, score, p2Name, p2NOC, walkover }
}

async function scrapeEvent(event: { year: number; discipline: string; resultId: number }): Promise<number> {
  const url = `${BASE}/results/${event.resultId}`
  const city = CITIES[event.year] ?? 'Unknown'

  const res = await fetch(url, {
    headers: { 'User-Agent': 'SmashLab/1.0 badminton analytics (educational/research use)' }
  })
  if (!res.ok) { console.log(`  ✗ HTTP ${res.status}`); return 0 }
  const html = await res.text()
  const tables = parseTables(html)

  // Upsert event
  const eventRows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO sl_olympic_event (id, year, city, discipline, "scrapedAt")
    VALUES (gen_random_uuid()::text, ${event.year}, ${city}, ${event.discipline}, NOW())
    ON CONFLICT (year, discipline) DO UPDATE SET "scrapedAt" = NOW()
    RETURNING id
  `
  const eventId = eventRows[0].id

  let matchesInserted = 0
  let currentRound = 'Group'

  // Delete existing matches for this event so re-runs are clean
  await prisma.$executeRaw`DELETE FROM sl_olympic_match WHERE "eventId" = ${eventId}`
  await prisma.$executeRaw`DELETE FROM sl_olympic_medal WHERE year = ${event.year} AND discipline = ${event.discipline}`

  for (let ti = 0; ti < tables.length; ti++) {
    const table = tables[ti]
    const headerJoined = table.headers.join(' ')

    // Detect round from small header tables (Format/Date lines)
    if (table.rows.length <= 2 && !isMatchTable(table.headers) && !isMedalTable(table.headers)) {
      const allText = (table.headers.join(' ') + ' ' + table.rows.flat().join(' ')).toLowerCase()
      if (allText.includes('final') || allText.includes('semi') || allText.includes('quarter') ||
          allText.includes('round') || allText.includes('group') || allText.includes('eliminat')) {
        currentRound = detectRound(allText)
      }
      continue
    }

    // Parse medal/standings table
    if (isMedalTable(table.headers)) {
      for (const row of table.rows) {
        if (row.length < 3) continue
        const pos = row[0]
        // Row format: Pos | (empty?) | Name | NOC | (Medal?)
        // Find NOC (2-3 uppercase letters)
        let noc = '', name = '', medal = ''
        for (let i = 1; i < row.length; i++) {
          if (/^[A-Z]{2,3}$/.test(row[i])) {
            noc = row[i]
            name = row.slice(1, i).filter(Boolean).join(' ') || row[i-1] || ''
            medal = row[i+1] ?? ''
            break
          }
        }
        if (!name || !noc) continue
        if (/^[=\d]/.test(pos)) {
          await prisma.$executeRaw`
            INSERT INTO sl_olympic_medal (id, year, city, discipline, position, "playerName", noc, medal)
            VALUES (gen_random_uuid()::text, ${event.year}, ${city}, ${event.discipline}, ${pos}, ${name}, ${noc}, ${medal || null})
            ON CONFLICT (year, discipline, "playerName", noc) DO UPDATE SET position = ${pos}, medal = ${medal || null}
          `
        }
      }
      continue
    }

    // Parse match table
    if (isMatchTable(table.headers)) {
      for (const row of table.rows) {
        const parsed = parseMatchRow(row)
        if (!parsed) continue
        const { p1Name, p1NOC, score, p2Name, p2NOC, walkover } = parsed

        // Determine winner (player on left when score doesn't start with "0-" pattern)
        // In olympedia, the winner is on the left side typically
        // We check if there's a "Q" qualifier marker or the score suggests a winner
        let winnerName = '', winnerNOC = ''
        if (!walkover && score && /\d/.test(score)) {
          const sets = score.split(/,\s*/)
          let p1wins = 0, p2wins = 0
          for (const set of sets) {
            const m = set.match(/(\d+)-(\d+)/)
            if (m) {
              if (parseInt(m[1]) > parseInt(m[2])) p1wins++
              else p2wins++
            }
          }
          if (p1wins > p2wins) { winnerName = p1Name; winnerNOC = p1NOC }
          else if (p2wins > p1wins) { winnerName = p2Name; winnerNOC = p2NOC }
        } else if (walkover) {
          // Walkover: the player who didn't give the walkover wins — usually p1
          winnerName = p1Name; winnerNOC = p1NOC
        }

        await prisma.$executeRaw`
          INSERT INTO sl_olympic_match (id, "eventId", year, discipline, round,
            "player1Name", "player1NOC", "player2Name", "player2NOC",
            score, "winnerName", "winnerNOC", walkover)
          VALUES (
            gen_random_uuid()::text, ${eventId}, ${event.year}, ${event.discipline},
            ${currentRound}, ${p1Name}, ${p1NOC || ''}, ${p2Name}, ${p2NOC || ''},
            ${score}, ${winnerName || null}, ${winnerNOC || null}, ${walkover}
          )
        `
        matchesInserted++
      }
    }
  }

  return matchesInserted
}

async function main() {
  console.log('SmashLab — Olympics Scraper (olympedia.org)')
  console.log(`${EVENTS.length} events to scrape · 10.5s delay between requests`)
  console.log('Estimated time: ~8 minutes\n')

  let total = 0
  for (const event of EVENTS) {
    process.stdout.write(`  ${event.year} ${event.discipline}... `)
    try {
      const n = await scrapeEvent(event)
      console.log(`${n} matches`)
      total += n
    } catch (e) {
      console.log(`ERROR: ${e}`)
    }
    await sleep(DELAY)
  }

  const [medalCount, matchCount] = await Promise.all([
    prisma.$queryRaw<[{n: number}]>`SELECT COUNT(*)::int as n FROM sl_olympic_medal`,
    prisma.$queryRaw<[{n: number}]>`SELECT COUNT(*)::int as n FROM sl_olympic_match`,
  ])
  console.log(`\nDone. Total: ${total} match records scraped`)
  console.log(`DB: ${matchCount[0].n} matches, ${medalCount[0].n} medal records`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
