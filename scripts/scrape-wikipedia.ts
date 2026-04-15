/**
 * Scrapes badminton tournament data from Wikipedia.
 * Fills gaps where badmintonstatistics.net has no data (e.g. recent months, championship events).
 *
 * Sources:
 *  - https://en.wikipedia.org/wiki/2026_BWF_World_Tour  (all 2026 World Tour finals)
 *  - https://en.wikipedia.org/wiki/2026_European_Badminton_Championships
 *  - https://en.wikipedia.org/wiki/2026_Badminton_Asia_Championships
 *
 * Usage: node --experimental-strip-types scripts/scrape-wikipedia.ts [--year 2026]
 */

import { prisma } from '../lib/prisma.ts'

const DELAY = 1500   // Wikipedia is friendly, 1.5s is fine
const UA = 'SmashLab/1.0 badminton analytics (educational; github.com/dramer94/SmashLab)'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function stripTags(html: string): string {
  return html
    .replace(/<sup[^>]*>.*?<\/sup>/gis, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .replace(/\[[\d,]+\]/g, '')   // remove [1], [2], [1,2] Wikipedia refs
    .replace(/\s+/g, ' ').trim()
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function parseTables(html: string): { caption: string; headers: string[]; rows: string[][] }[] {
  const tables: { caption: string; headers: string[]; rows: string[][] }[] = []
  const tableRx = /<table[^>]*>([\s\S]*?)<\/table>/gi
  let tm: RegExpExecArray | null
  while ((tm = tableRx.exec(html)) !== null) {
    const tHtml = tm[1]
    const captionM = tHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)
    const caption = captionM ? stripTags(captionM[1]) : ''
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
    if (rows.length > 0) tables.push({ caption, headers: rows[0], rows: rows.slice(1) })
  }
  return tables
}

async function fetchWiki(path: string): Promise<string> {
  const url = `https://en.wikipedia.org/wiki/${path}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

// Map Wikipedia tournament names to levels
function inferLevel(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('world championships') || n.includes('thomas') || n.includes('uber') || n.includes('sudirman')) return 'Major'
  if (n.includes('final')) return 'Major'
  if (n.includes('european') || n.includes('asian') || n.includes('asia ') || n.includes('pan am') || n.includes('oceania') || n.includes('africa')) return 'Major'
  if (n.includes('all england') || n.includes('malaysia open') || n.includes('china open') || n.includes('indonesia open') || n.includes('japan open') || n.includes('korea open') || n.includes('india open') || n.includes('denmark open') || n.includes('french open') || n.includes('fuzhou')) return 'Super 1000'
  if (n.includes('thailand open') || n.includes('singapore open') || n.includes('vietnam open') || n.includes('hong kong') || n.includes('australia')) return 'Super 750'
  if (n.includes('master')) return 'Super 500'
  return 'Super 300'
}

// Discipline column header → category code
const DISC_MAP: Record<string, string> = {
  "men's singles": 'MS', "men's single": 'MS', 'ms': 'MS',
  "women's singles": 'WS', "women's single": 'WS', 'ws': 'WS',
  "men's doubles": 'MD', "men's double": 'MD', 'md': 'MD',
  "women's doubles": 'WD', "women's double": 'WD', 'wd': 'WD',
  'mixed doubles': 'XD', 'mixed double': 'XD', 'xd': 'XD',
}

function toCategory(s: string): string | null {
  const key = s.toLowerCase().trim()
  return DISC_MAP[key] ?? null
}

// Upsert player by name+country. Try to find existing; else create.
async function findOrCreatePlayer(name: string, country: string, category: string): Promise<string | null> {
  if (!name || name === 'TBD' || name === 'TBA') return null

  // Try exact name match
  let player = await prisma.slPlayer.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
  if (player) return player.id

  // Create new
  let slug = slugify(name)
  let suffix = 2
  while (await prisma.slPlayer.findUnique({ where: { slug } })) {
    slug = `${slugify(name)}-${suffix++}`
  }

  try {
    player = await prisma.slPlayer.create({
      data: {
        name,
        slug,
        country: country || 'UNK',
        category,
        isActive: true,
      },
    })
    return player.id
  } catch {
    // Race condition on slug — retry lookup
    const found = await prisma.slPlayer.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
    return found?.id ?? null
  }
}

// Parse "Player Name / Partner Name" for doubles
function parseNames(s: string): { name: string; partner: string | null } {
  // Wikipedia doubles: "Lee / Wong" or "Lee Zii Jia / Wong Tien Ci"
  // Also might be "Lee Zii Jia\nWong Tien Ci" after stripping tags
  const slash = s.split(/\s*\/\s*/)
  if (slash.length === 2) return { name: slash[0].trim(), partner: slash[1].trim() }
  return { name: s.trim(), partner: null }
}

// ─── Scrape 2026 BWF World Tour ────────────────────────────────────────────────

interface FinalResult {
  tournamentName: string
  startDate: string   // YYYY-MM-DD
  endDate: string
  location: string
  country: string
  category: string
  winner: string
  winnerPartner: string | null
  winnerCountry: string
  runnerUp: string
  runnerUpPartner: string | null
  runnerUpCountry: string
  score: string
}

async function scrapeWorldTour(year: number): Promise<FinalResult[]> {
  console.log(`\nFetching Wikipedia: ${year} BWF World Tour...`)
  const html = await fetchWiki(`${year}_BWF_World_Tour`)
  const results: FinalResult[] = []

  /**
   * Wikipedia BWF World Tour page structure (per-month tables):
   *   Headers: Date | Tournament | Champions | Runners-up
   *   Each tournament spans 10 rows (5 disciplines × 2 rows):
   *     row N:   Date | TournamentName | MS_Winner | MS_Runner-up
   *     row N+1: "Score: XX-XX, XX-XX"
   *     row N+2: WS_Winner | WS_Runner-up
   *     row N+3: "Score: ..."
   *     row N+4: MD_Winner (pair) | MD_Runner-up (pair)
   *     ... etc
   */
  const DISC_ORDER = ['MS', 'WS', 'MD', 'WD', 'XD']

  // Parse raw rows from HTML (preserving multi-cell vs single-cell structure)
  const tableRx = /<table[^>]*>([\s\S]*?)<\/table>/gi
  let tm: RegExpExecArray | null
  while ((tm = tableRx.exec(html)) !== null) {
    const tHtml = tm[1]
    // Only process tables with Champions/Runners-up headers
    const firstRowM = tHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)
    if (!firstRowM) continue
    const firstRowText = stripTags(firstRowM[1]).toLowerCase()
    if (!firstRowText.includes('champion') && !firstRowText.includes('runner')) continue

    // Get all rows with their raw cell content
    const rawRows: string[][] = []
    const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rm: RegExpExecArray | null
    while ((rm = rowRx.exec(tHtml)) !== null) {
      const cells: string[] = []
      const cellRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
      let cm: RegExpExecArray | null
      while ((cm = cellRx.exec(rm[1])) !== null) {
        cells.push(stripTags(cm[1]))
      }
      if (cells.length > 0) rawRows.push(cells)
    }

    // Skip header row
    let i = 1
    while (i < rawRows.length) {
      const row = rawRows[i]
      // A tournament-start row has 4 cells: Date | Tournament | MS_Winner | MS_Runner-up
      if (row.length >= 4 && row[0].match(/\d/) && row[1].length > 3) {
        const dateCell = row[0]
        const tournCell = row[1]
        const dates = parseDateRange(`${dateCell} ${year}`, year)

        // Extract location from tournament cell ("Host: City")
        const hostM = tournCell.match(/Host:\s*(.+)/)
        const { location, country } = hostM ? parseLocation(hostM[1].trim()) : { location: '', country: '' }
        // Clean tournament name
        const tournName = tournCell.replace(/\(.*?\)/g, '').replace(/Host:.*$/s, '').trim()
          .replace(/\s+/g, ' ').trim()

        // Process 5 disciplines: current row has MS, then 2 more rows each for WS/MD/WD/XD
        for (let d = 0; d < DISC_ORDER.length; d++) {
          const cat = DISC_ORDER[d]
          const dataRow = d === 0 ? row : rawRows[i + d * 2]
          if (!dataRow) break

          const winnerRaw = d === 0 ? dataRow[2] : dataRow[0]
          const runnerUpRaw = d === 0 ? dataRow[3] : dataRow[1]
          if (!winnerRaw || !runnerUpRaw) continue

          // Get score from next row
          const scoreRow = rawRows[i + d * 2 + 1]
          const scoreCell = scoreRow?.find(c => c.toLowerCase().includes('score:')) ?? ''
          const score = scoreCell.replace(/^Score:\s*/i, '').trim()

          const { name: winner, partner: winnerPartner } = parseNames(winnerRaw.replace(/\s{2,}/g, ' / '))
          const { name: runnerUp, partner: runnerUpPartner } = parseNames(runnerUpRaw.replace(/\s{2,}/g, ' / '))

          if (!winner || !runnerUp) continue

          results.push({
            tournamentName: tournName,
            startDate: dates.start,
            endDate: dates.end,
            location,
            country,
            category: cat,
            winner, winnerPartner, winnerCountry: '',
            runnerUp, runnerUpPartner, runnerUpCountry: '',
            score,
          })
        }
        i += 11  // skip 10 data rows + 1 to next tournament
      } else {
        i++
      }
    }
  }

  return results
}

function parseDateRange(cell: string, year: number): { start: string; end: string } {
  // "6–11 January 2026" or "3–8 March 2026"
  const m = cell.match(/(\d+)[–\-–](\d+)\s+(\w+)\s+(\d{4})/) ||
             cell.match(/(\d+)\s+(\w+)\s*[–\-–]\s*(\d+)\s+(\w+)\s+(\d{4})/)
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
  }
  if (m) {
    const mon = months[m[3].toLowerCase()] ?? '01'
    const y = m[4] ?? String(year)
    const start = `${y}-${mon}-${m[1].padStart(2, '0')}`
    const end = `${y}-${mon}-${m[2].padStart(2, '0')}`
    return { start, end }
  }
  return { start: `${year}-01-01`, end: `${year}-01-07` }
}

function parseLocation(cell: string): { location: string; country: string } {
  // Usually "City, Country" or just "City"
  const parts = cell.split(',').map(s => s.trim())
  return { location: parts[0] || '', country: parts[1] || '' }
}

// Parse final cell like "Kunlavut Vitidsarn def. Shi Yuqi 23-21, 6-1 ret."
// or "Kim Won-ho / Seo Seung-jae def. Aaron Chia / Soh Wooi Yik 18-21, 21-12, 21-19"
function parseFinalCell(cell: string, _cat: string): {
  winner: string; winnerPartner: string | null; winnerCountry: string;
  runnerUp: string; runnerUpPartner: string | null; runnerUpCountry: string;
  score: string
} | null {
  // Look for "def." separator
  const defIdx = cell.indexOf(' def. ')
  if (defIdx < 0) return null

  const winnerPart = cell.slice(0, defIdx).trim()
  const rest = cell.slice(defIdx + 6).trim()

  // Extract score (score comes after runner-up name — has digits and hyphens)
  // Find where the score starts: usually last segment with pattern \d+-\d+
  const scoreM = rest.match(/(\d{1,2}[–\-]\d{1,2}.*)$/)
  let runnerUpPart = rest
  let score = ''
  if (scoreM) {
    score = scoreM[1].trim()
    runnerUpPart = rest.slice(0, rest.indexOf(scoreM[0])).trim()
  }

  // Also might have country in brackets: "Kunlavut Vitidsarn (Thailand)"
  const stripCountry = (s: string): { name: string; country: string } => {
    const cm = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
    if (cm) return { name: cm[1].trim(), country: cm[2].trim() }
    return { name: s.trim(), country: '' }
  }

  const { name: winnerRaw, country: winnerCountry } = stripCountry(winnerPart)
  const { name: runnerUpRaw, country: runnerUpCountry } = stripCountry(runnerUpPart.replace(/,$/, '').trim())

  const { name: winner, partner: winnerPartner } = parseNames(winnerRaw)
  const { name: runnerUp, partner: runnerUpPartner } = parseNames(runnerUpRaw)

  if (!winner || !runnerUp) return null

  return { winner, winnerPartner, winnerCountry, runnerUp, runnerUpPartner, runnerUpCountry, score }
}

// ─── Scrape Championship Events ────────────────────────────────────────────────

interface ChampionshipResult {
  category: string
  gold: string; goldPartner: string | null; goldCountry: string
  silver: string; silverPartner: string | null; silverCountry: string
  score: string
}

// Parse the Wikipedia infobox to extract dates and location
function extractInfobox(html: string, year: number): { start: string; end: string; location: string; country: string } {
  const MONTHS: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  }

  // Find infobox table
  const infoboxM = html.match(/<table[^>]*infobox[^>]*>([\s\S]*?)<\/table>/i)
  if (!infoboxM) return { start: `${year}-01-01`, end: `${year}-01-07`, location: '', country: '' }

  const rows = [...infoboxM[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
  let dateStr = '', location = '', country = ''

  for (const rowM of rows) {
    const cells = [...rowM[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(c => stripTags(c[1]).trim())
      .filter(Boolean)

    if (cells.length >= 2) {
      const label = cells[0].toLowerCase()
      const value = cells[1]
      if (label === 'dates' || label === 'date') dateStr = value
      if (label === 'location') {
        const parts = value.split(',').map(s => s.trim())
        location = parts[0] ?? ''
        country = parts[1] ?? ''
      }
    }
  }

  // Parse date string: "7–12 April 2026" or "6–12 April" (year from page title)
  const dm = dateStr.match(/(\d+)[–\-](\d+)\s+(\w+)(?:\s+(\d{4}))?/)
  if (dm) {
    const mon = MONTHS[dm[3].toLowerCase()] ?? '01'
    const y = dm[4] ?? String(year)
    return {
      start: `${y}-${mon}-${dm[1].padStart(2, '0')}`,
      end: `${y}-${mon}-${dm[2].padStart(2, '0')}`,
      location,
      country,
    }
  }

  return { start: `${year}-01-01`, end: `${year}-01-07`, location, country }
}

async function scrapeChampionship(wikiPath: string): Promise<{ results: ChampionshipResult[]; dates: { start: string; end: string; location: string; country: string } }> {
  console.log(`\nFetching Wikipedia: ${wikiPath}...`)
  const html = await fetchWiki(wikiPath)

  // Extract dates/location from infobox — no hardcoding
  const year = parseInt(wikiPath.match(/\d{4}/)?.[0] ?? String(new Date().getFullYear()))
  const dates = extractInfobox(html, year)
  console.log(`  Dates: ${dates.start} → ${dates.end} | Location: ${dates.location}, ${dates.country}`)

  const results: ChampionshipResult[] = []
  const tables = parseTables(html)

  for (const table of tables) {
    const hJoined = table.headers.join(' ').toLowerCase()
    // Medal summary table: "Event | Gold | Silver | Bronze" or "Event | Gold medalist | Silver..."
    if (!hJoined.includes('gold') || !hJoined.includes('silver')) continue
    if (!hJoined.includes('event') && !hJoined.includes('discipline')) continue

    const headers = table.headers.map(h => h.toLowerCase().trim())
    const eventIdx = headers.findIndex(h => h.includes('event') || h.includes('discipline'))
    const goldIdx = headers.findIndex(h => h.includes('gold'))
    const silverIdx = headers.findIndex(h => h.includes('silver'))

    if (eventIdx < 0 || goldIdx < 0 || silverIdx < 0) continue

    for (const row of table.rows) {
      const eventCell = row[eventIdx]?.trim()
      if (!eventCell) continue

      const cat = toCategory(eventCell)
      if (!cat) continue

      const goldCell = row[goldIdx]?.trim() ?? ''
      const silverCell = row[silverIdx]?.trim() ?? ''

      // Gold cell might be "Player Name Country" or "Player / Partner Country"
      // Score might be in a separate column or embedded
      const goldParsed = parseChampionshipCell(goldCell)
      const silverParsed = parseChampionshipCell(silverCell)

      results.push({
        category: cat,
        gold: goldParsed.name, goldPartner: goldParsed.partner, goldCountry: goldParsed.country,
        silver: silverParsed.name, silverPartner: silverParsed.partner, silverCountry: silverParsed.country,
        score: '',
      })
    }
  }

  return { results, dates }
}

function parseChampionshipCell(cell: string): { name: string; partner: string | null; country: string } {
  // Usually "Player Name Country" where country is last 2-3 word
  // Or "Player / Partner Country"
  const cm = cell.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (cm) {
    const { name, partner } = parseNames(cm[1].trim())
    return { name, partner, country: cm[2].trim() }
  }
  // Try to detect country as last capitalized word
  const words = cell.trim().split(/\s+/)
  const lastWord = words[words.length - 1]
  if (lastWord && /^[A-Z]/.test(lastWord) && lastWord.length > 1 && !lastWord.includes('/')) {
    const nameStr = words.slice(0, -1).join(' ')
    const { name, partner } = parseNames(nameStr)
    return { name, partner, country: lastWord }
  }
  const { name, partner } = parseNames(cell)
  return { name, partner, country: '' }
}

// ─── Database writes ────────────────────────────────────────────────────────────

async function upsertTournamentFromWiki(
  name: string, startDate: string, endDate: string,
  location: string, country: string, year: number
): Promise<string> {
  // Check if already exists (by name + year)
  const existing = await prisma.slTournament.findFirst({
    where: { name: { contains: name.slice(0, 20), mode: 'insensitive' }, year },
  })
  if (existing) return existing.id

  let slug = slugify(`${name}-${year}`)
  let suffix = 2
  while (await prisma.slTournament.findUnique({ where: { slug } })) {
    slug = `${slugify(name)}-${year}-${suffix++}`
  }

  const t = await prisma.slTournament.create({
    data: {
      name,
      slug,
      level: inferLevel(name),
      location: location || null,
      country: country || null,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      year,
      externalId: `wiki-${slug}`,
    },
  })
  return t.id
}

async function upsertFinalMatch(
  tournamentId: string, category: string,
  winner: string, winnerPartner: string | null, winnerCountry: string,
  runnerUp: string, runnerUpPartner: string | null, runnerUpCountry: string,
  score: string, tournamentDate: string
): Promise<boolean> {
  const p1Id = await findOrCreatePlayer(winner, winnerCountry, category)
  const p2Id = await findOrCreatePlayer(runnerUp, runnerUpCountry, category)
  if (!p1Id || !p2Id) return false

  // Check if final already exists
  const existing = await prisma.slMatch.findFirst({
    where: { tournamentId, round: 'F', category, player1Id: p1Id, player2Id: p2Id },
  })
  if (existing) return false

  await prisma.slMatch.create({
    data: {
      tournamentId,
      round: 'F',
      date: new Date(tournamentDate),
      category,
      player1Id: p1Id,
      player2Id: p2Id,
      player1Partner: winnerPartner,
      player2Partner: runnerUpPartner,
      score,
      winnerId: p1Id,
    },
  })

  // Update matchCount for both players
  await prisma.slPlayer.update({ where: { id: p1Id }, data: { matchCount: { increment: 1 } } })
  await prisma.slPlayer.update({ where: { id: p2Id }, data: { matchCount: { increment: 1 } } })

  return true
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const yearArg = args.findIndex(a => a === '--year')
  const year = yearArg >= 0 ? parseInt(args[yearArg + 1]) : new Date().getFullYear()

  console.log(`SmashLab — Wikipedia Scraper (year=${year})`)

  // 1. Scrape main World Tour page
  const worldTourResults = await scrapeWorldTour(year)
  console.log(`\nFound ${worldTourResults.length} final results from World Tour page`)

  await sleep(DELAY)

  // 2. Group by tournament and write to DB
  const tournMap = new Map<string, string>()  // tournamentName → id
  let newTournaments = 0
  let newMatches = 0

  for (const r of worldTourResults) {
    const key = `${r.tournamentName}||${r.startDate}`
    let tid = tournMap.get(key)
    if (!tid) {
      const existing = await prisma.slTournament.findFirst({
        where: {
          name: { contains: r.tournamentName.slice(0, 15), mode: 'insensitive' },
          year,
        },
      })
      if (existing) {
        tid = existing.id
      } else {
        tid = await upsertTournamentFromWiki(r.tournamentName, r.startDate, r.endDate, r.location, r.country, year)
        newTournaments++
        console.log(`  + Tournament: ${r.tournamentName}`)
      }
      tournMap.set(key, tid)
    }

    const added = await upsertFinalMatch(
      tid, r.category,
      r.winner, r.winnerPartner, r.winnerCountry,
      r.runnerUp, r.runnerUpPartner, r.runnerUpCountry,
      r.score, r.endDate || r.startDate
    )
    if (added) newMatches++
  }

  console.log(`World Tour: +${newTournaments} tournaments, +${newMatches} finals`)

  // 3. Scrape European & Asian Championships separately
  // Dates and location are extracted live from each Wikipedia infobox — no hardcoding
  const championships = [
    { path: `${year}_European_Badminton_Championships`, name: `${year} European Badminton Championships` },
    { path: `${year}_Badminton_Asia_Championships`, name: `${year} Badminton Asia Championships` },
  ]

  for (const champ of championships) {
    await sleep(DELAY)
    try {
      const { results, dates } = await scrapeChampionship(champ.path)
      if (results.length === 0) { console.log(`  No data found for ${champ.name}`); continue }

      const tid = await upsertTournamentFromWiki(
        champ.name, dates.start, dates.end,
        dates.location, dates.country, year
      )

      // Update dates if tournament already exists (may have had wrong placeholder dates)
      await prisma.slTournament.updateMany({
        where: { id: tid },
        data: {
          startDate: new Date(dates.start),
          endDate: new Date(dates.end),
          location: dates.location || undefined,
          country: dates.country || undefined,
        },
      })

      let champMatches = 0
      for (const r of results) {
        if (!r.gold || !r.silver) continue
        const added = await upsertFinalMatch(
          tid, r.category,
          r.gold, r.goldPartner, r.goldCountry,
          r.silver, r.silverPartner, r.silverCountry,
          r.score, `${year}-01-07`
        )
        if (added) champMatches++
      }
      console.log(`${champ.name}: ${results.length} events, +${champMatches} finals`)
    } catch (e) {
      console.log(`  Error scraping ${champ.name}: ${e}`)
    }
  }

  // Summary
  const [tCount, mCount] = await Promise.all([
    prisma.slTournament.count({ where: { year } }),
    prisma.slMatch.count({ where: { tournament: { year } } }),
  ])
  console.log(`\nDone. DB now has ${tCount} tournaments and ${mCount} matches for ${year}.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
