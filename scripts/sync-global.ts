export {}

import { PrismaClient } from '@prisma/client'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'

const execFileAsync = promisify(execFile)
const prisma = new PrismaClient()

const BASE_URL = 'https://www.badmintonstatistics.net'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
const CHECKPOINT_FILE = '/tmp/smashlab-sync-checkpoint.json'
const REPORT_PAGE_SIZE = 25

// ─── Types ────────────────────────────────────────────────────────────────────

type NullableString = string | null

interface DiscoveredPlayer {
  id: string
  name: string
  country: string
  category: string
}

interface ExtractedPlayer {
  id: string
  name: string
  country: string
}

interface MatchCandidate {
  category: string
  rawRound: string
  side1: ExtractedPlayer[]
  side2: ExtractedPlayer[]
  score: string
  durationMin: number | null
  winnerSide: 1 | 2 | null
}

interface ScrapedTournamentMeta {
  name: string
  level: string
  location: NullableString
  country: NullableString
  startDate: string
  endDate: NullableString
  year: number
}

interface ParsedTournament {
  tournament: ScrapedTournamentMeta
  matches: MatchCandidate[]
}

interface SyncArgs {
  startYear: number
  endYear: number
  concurrency: number
  delayMs: number
  mode: 'full' | 'incremental'
  dryRun: boolean
}

// ─── Country Map ──────────────────────────────────────────────────────────────

const COUNTRY_CODE_MAP: Record<string, string> = {
  Afghanistan: 'AFG',
  Albania: 'ALB',
  Algeria: 'ALG',
  Angola: 'ANG',
  Argentina: 'ARG',
  Armenia: 'ARM',
  Australia: 'AUS',
  Austria: 'AUT',
  Azerbaijan: 'AZE',
  Bahrain: 'BRN',
  Bangladesh: 'BAN',
  Belarus: 'BLR',
  Belgium: 'BEL',
  Bolivia: 'BOL',
  'Bosnia & Herzegovina': 'BIH',
  Botswana: 'BOT',
  Brazil: 'BRA',
  Bulgaria: 'BUL',
  Cambodia: 'CAM',
  Cameroon: 'CMR',
  Canada: 'CAN',
  Chile: 'CHI',
  China: 'CHN',
  'Chinese Taipei': 'TPE',
  Colombia: 'COL',
  'Congo, Democratic Republic of': 'COD',
  Croatia: 'CRO',
  Cyprus: 'CYP',
  'Czech Republic': 'CZE',
  Denmark: 'DEN',
  Ecuador: 'ECU',
  Egypt: 'EGY',
  England: 'ENG',
  Estonia: 'EST',
  Ethiopia: 'ETH',
  Finland: 'FIN',
  France: 'FRA',
  Georgia: 'GEO',
  Germany: 'GER',
  Ghana: 'GHA',
  'Great Britain': 'GBR',
  Greece: 'GRE',
  Guatemala: 'GUA',
  'Hong Kong': 'HKG',
  Hungary: 'HUN',
  Iceland: 'ISL',
  India: 'IND',
  Indonesia: 'INA',
  Iran: 'IRI',
  Iraq: 'IRQ',
  Ireland: 'IRL',
  Israel: 'ISR',
  Italy: 'ITA',
  Japan: 'JPN',
  Jordan: 'JOR',
  Kazakhstan: 'KAZ',
  Kenya: 'KEN',
  Korea: 'KOR',
  'Korea, South': 'KOR',
  Kuwait: 'KUW',
  Kyrgyzstan: 'KGZ',
  Latvia: 'LAT',
  Lebanon: 'LBN',
  Lithuania: 'LTU',
  Luxembourg: 'LUX',
  Macau: 'MAC',
  Macedonia: 'MKD',
  Madagascar: 'MAD',
  Malaysia: 'MAS',
  Maldives: 'MDV',
  Malta: 'MLT',
  Mauritius: 'MRI',
  Mexico: 'MEX',
  Moldova: 'MDA',
  Mongolia: 'MGL',
  Morocco: 'MAR',
  Myanmar: 'MYA',
  Nepal: 'NEP',
  Netherlands: 'NED',
  'New Zealand': 'NZL',
  Nigeria: 'NGR',
  Norway: 'NOR',
  Oman: 'OMA',
  Pakistan: 'PAK',
  Panama: 'PAN',
  'Papua New Guinea': 'PNG',
  Paraguay: 'PAR',
  Peru: 'PER',
  Philippines: 'PHI',
  Poland: 'POL',
  Portugal: 'POR',
  Qatar: 'QAT',
  Romania: 'ROU',
  Russia: 'RUS',
  'Saudi Arabia': 'KSA',
  Scotland: 'SCO',
  Senegal: 'SEN',
  Serbia: 'SRB',
  Singapore: 'SGP',
  Slovakia: 'SVK',
  Slovenia: 'SLO',
  'South Africa': 'RSA',
  Spain: 'ESP',
  'Sri Lanka': 'SRI',
  Sweden: 'SWE',
  Switzerland: 'SUI',
  Syria: 'SYR',
  Taiwan: 'TPE',
  Tajikistan: 'TJK',
  Tanzania: 'TAN',
  Thailand: 'THA',
  'Trinidad & Tobago': 'TTO',
  Tunisia: 'TUN',
  Turkey: 'TUR',
  Turkmenistan: 'TKM',
  Uganda: 'UGA',
  Ukraine: 'UKR',
  'United Arab Emirates': 'UAE',
  'United States': 'USA',
  'U.S.A.': 'USA',
  USA: 'USA',
  Uruguay: 'URU',
  Uzbekistan: 'UZB',
  Venezuela: 'VEN',
  Vietnam: 'VIE',
  Wales: 'WAL',
  Zambia: 'ZAM',
  Zimbabwe: 'ZIM',
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchText(path: string, delayMs: number, retries = 3): Promise<string> {
  await sleep(delayMs)
  const url = new URL(path, BASE_URL).toString()

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { stdout } = await execFileAsync(
        'curl',
        ['-sS', '-A', USER_AGENT, '--max-time', '45', url],
        { maxBuffer: 24 * 1024 * 1024 }
      )
      return stdout
    } catch (err) {
      if (attempt === retries) {
        console.warn(`[fetchText] All retries failed for ${path}: ${(err as Error).message}`)
        return ''
      }
      const backoff = [2000, 8000, 30000][attempt] ?? 30000
      console.warn(`[fetchText] Attempt ${attempt + 1} failed for ${path}, retrying in ${backoff}ms...`)
      await sleep(backoff)
    }
  }

  return ''
}

interface TournamentSearchResult {
  unifiedId: string
  name: string
  startDate: string
  endDate: string
  city: string
  country: string
  category: string
  isTeamTournament: boolean
  isJuniorTournament: boolean
  isWorldTour: boolean
}

// ─── Tournament Discovery via JSON Search API ─────────────────────────────────
// Much faster than year-by-year player report scraping (JSON vs HTML, no pagination)

const SEARCH_TERMS = [
  'International', 'Open', 'Championship', 'Masters',
  'Cup', 'Grand', 'Series', 'World', 'Thomas', 'Sudirman',
  'All England', 'Olympic', 'Korea', 'China', 'Japan', 'India',
  'Final', 'Super', 'Tour', 'Invitation',
]

async function discoverTournamentsViaSearch(
  startYear: number,
  endYear: number,
): Promise<Set<string>> {
  const allGuids = new Set<string>()
  console.log(`Discovering tournaments for ${startYear}-${endYear} via JSON search API...`)

  for (const term of SEARCH_TERMS) {
    try {
      const url = `${BASE_URL}/JQuery/SearchTournament/${encodeURIComponent(term)}`
      const { stdout } = await execFileAsync(
        'curl',
        ['-sS', '-A', USER_AGENT, '--max-time', '30', url],
        { maxBuffer: 8 * 1024 * 1024 }
      )
      const data: TournamentSearchResult[] = JSON.parse(stdout)
      let added = 0
      for (const t of data) {
        const year = Number(t.startDate.substring(0, 4))
        if (year >= startYear && year <= endYear) {
          if (!allGuids.has(t.unifiedId)) {
            allGuids.add(t.unifiedId)
            added++
          }
        }
      }
      console.log(`  "${term}": ${data.length} results → ${added} new in year range`)
      await sleep(500)
    } catch (err) {
      console.warn(`  "${term}": search failed — ${(err as Error).message}`)
    }
  }

  console.log(`Total unique tournaments discovered: ${allGuids.size}`)
  return allGuids
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = []
  let index = 0

  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index++
      const task = tasks[taskIndex]
      if (task) {
        results[taskIndex] = await task()
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, num) => String.fromCodePoint(Number.parseInt(num, 16)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name.toLowerCase()] ?? `&${name};`)
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ''))
}

function cleanText(value: string): string {
  return stripTags(value)
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function slugify(value: string): string {
  return decodeHtmlEntities(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function mapCountry(title: string): string {
  return COUNTRY_CODE_MAP[decodeHtmlEntities(title).trim()] ?? decodeHtmlEntities(title).trim().toUpperCase()
}

function mapTournamentLevel(raw: string): string {
  const text = cleanText(raw)

  if (/Super 1000/i.test(text)) return 'Super 1000'
  if (/Super 750/i.test(text)) return 'Super 750'
  if (/Super 500/i.test(text)) return 'Super 500'
  if (/Super 300/i.test(text)) return 'Super 300'
  if (/Super 100/i.test(text)) return 'Super 100'
  if (/World Tour Finals|Olympic|World Championships|World Championship/i.test(text)) return 'Major'
  if (/Asia Championships|Asian Championship|Badminton Asia/i.test(text)) return 'Major'
  if (/Europe Championships|European Championship|Badminton Europe/i.test(text)) return 'Major'
  if (/Thomas Cup|Uber Cup|Sudirman Cup|BWF Team|Grade 1 - Team/i.test(text)) return 'Team'
  if (/Olympic|Grade 1 - Individual/i.test(text)) return 'Major'
  if (/Major/i.test(text)) return 'Major'

  return text
}

function extractRows(tableHtml: string): string[] {
  return [...tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((match) => match[1])
}

function extractCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1])
}

function extractPlayersFromCell(cellHtml: string): ExtractedPlayer[] {
  const countryTitles = [...cellHtml.matchAll(/<img[^>]*title="([^"]+)"/gi)].map((match) =>
    mapCountry(match[1])
  )
  const links = [...cellHtml.matchAll(/<a href="Player\?playerid=([^"]+)">([\s\S]*?)<\/a>/gi)]

  return links.map((match, index) => ({
    id: decodeHtmlEntities(match[1]),
    name: cleanText(match[2]),
    country: countryTitles[index] ?? 'UNK',
  }))
}

function normalizeScore(score: string): string {
  return cleanText(score).replace(/\s*\/\s*/g, ' ')
}

function inferWinnerSide(side1Html: string, side2Html: string): 1 | 2 | null {
  const side1Bold = /<b>/i.test(side1Html)
  const side2Bold = /<b>/i.test(side2Html)

  if (side1Bold && !side2Bold) return 1
  if (side2Bold && !side1Bold) return 2
  return 1
}

function getRoundMappings(rawRounds: string[]): Map<string, string> {
  const unique = new Set(rawRounds)
  const mapping = new Map<string, string>()

  if (unique.has('Final')) mapping.set('Final', 'F')
  if (unique.has('Semi-final')) mapping.set('Semi-final', 'SF')
  if (unique.has('Quarter-final')) mapping.set('Quarter-final', 'QF')
  if (unique.has('Group')) mapping.set('Group', 'Group')

  if (unique.has('Round 2')) {
    mapping.set('Round 2', 'R16')
    mapping.set('Round 1', 'R32')
  } else if (unique.has('Quarter-final')) {
    mapping.set('Round 1', 'R16')
  } else if (unique.has('Semi-final')) {
    mapping.set('Round 1', 'QF')
  }

  if (unique.has('Round 3')) {
    mapping.set('Round 3', 'R16')
    mapping.set('Round 2', 'R32')
    mapping.set('Round 1', 'R64')
  }

  return mapping
}

function toIsoDate(day: string, month: string, year: string): string {
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function parseSlashDateRange(value: string) {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})-(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) return null

  return {
    startDate: toIsoDate(match[1], match[2], match[3]),
    endDate: toIsoDate(match[4], match[5], match[6]),
  }
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function estimateMatchDate(
  startDate: string,
  endDate: NullableString,
  roundCode: string
): string {
  const offsets: Record<string, number> = {
    F: 0,
    SF: -1,
    QF: -2,
    R16: -3,
    R32: -4,
    R64: -5,
    Group: 0,
  }

  const end = endDate ?? startDate
  const tentative = addDays(end, offsets[roundCode] ?? 0)

  if (tentative < startDate) return startDate
  if (endDate && tentative > endDate) return endDate

  return tentative
}

// ─── HTML Parsers ─────────────────────────────────────────────────────────────

function parseReportTotalRows(html: string): number {
  const match = html.match(/id="report_totalRows"[^>]*value="(\d+)"/i)
  return match ? Number(match[1]) : 0
}

function parsePlayerTableRows(html: string): DiscoveredPlayer[] {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)
  if (!tbodyMatch) return []

  const rows: DiscoveredPlayer[] = []

  for (const row of extractRows(tbodyMatch[1])) {
    const cells = extractCells(row)
    if (cells.length < 2) continue

    const category = cleanText(cells[1])
    const players = extractPlayersFromCell(cells[0])

    for (const player of players) {
      if (player.id) {
        rows.push({ id: player.id, name: player.name, country: player.country, category })
      }
    }
  }

  return rows
}

function parseTournamentMetadata(html: string): ScrapedTournamentMeta | null {
  const nameMatch = html.match(/Tournament Name:<\/b>\s*([^<]+)<br/i)
  const dateMatch = html.match(/Tournament Dates:<\/b>\s*([^<]+)<br/i)
  const locationMatch = html.match(/Location:<\/b>\s*([^<]+)<br/i)
  const categoryMatch = html.match(/Category:<\/b>\s*([^<\n]+)/i)

  if (!nameMatch || !dateMatch || !locationMatch || !categoryMatch) return null

  const name = cleanText(nameMatch[1])
  const dates = parseSlashDateRange(cleanText(dateMatch[1]))
  if (!dates) return null

  const locationValue = cleanText(locationMatch[1])
  const locationParts = locationValue.split(',').map((p) => p.trim()).filter(Boolean)
  const country = locationParts[0] ?? null
  const location = locationParts.slice(1).join(', ') || null
  const level = mapTournamentLevel(categoryMatch[1])
  const year = Number(dates.startDate.slice(0, 4))

  return { name, level, location, country, startDate: dates.startDate, endDate: dates.endDate, year }
}

function parseTournamentMatches(html: string): MatchCandidate[] {
  const matchesSection = html.match(/<h5>Matches<\/h5>[\s\S]*?<table class="reportTable">([\s\S]*?)<\/table>/i)
  if (!matchesSection) return []

  const candidates: MatchCandidate[] = []
  let currentCategory = ''

  for (const row of extractRows(matchesSection[1])) {
    const categoryMatch = row.match(/class="reportSubHeader">([^<]+)</i)
    if (categoryMatch) {
      currentCategory = cleanText(categoryMatch[1])
      continue
    }

    const cells = extractCells(row)
    if (cells.length !== 7 || !currentCategory) continue

    const rawRound = cleanText(cells[0])
    if (/qual/i.test(currentCategory) || /qualification/i.test(rawRound)) continue

    const side1 = extractPlayersFromCell(cells[2])
    const side2 = extractPlayersFromCell(cells[4])
    if (side1.length === 0 || side2.length === 0) continue

    const duration = Number.parseInt(cleanText(cells[6]), 10)

    candidates.push({
      category: currentCategory,
      rawRound,
      side1,
      side2,
      score: normalizeScore(cells[3]),
      durationMin: Number.isFinite(duration) ? duration : null,
      winnerSide: inferWinnerSide(cells[2], cells[4]),
    })
  }

  return candidates
}

// ─── CLI Args ─────────────────────────────────────────────────────────────────

function parseArgs(): SyncArgs {
  const nowYear = new Date().getUTCFullYear()
  let startYear = nowYear - 1
  let endYear = nowYear
  let concurrency = 4
  let delayMs = 300
  let mode: 'full' | 'incremental' = 'full'
  let dryRun = false

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    const next = process.argv[i + 1]

    if (arg === '--start-year' && next) { startYear = Number(next); i++ }
    else if (arg === '--end-year' && next) { endYear = Number(next); i++ }
    else if (arg === '--concurrency' && next) { concurrency = Number(next); i++ }
    else if (arg === '--delay-ms' && next) { delayMs = Number(next); i++ }
    else if (arg === '--mode' && next) { mode = next as 'full' | 'incremental'; i++ }
    else if (arg === '--dry-run') { dryRun = true }
  }

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || startYear > endYear) {
    throw new Error(`Invalid year range: start=${startYear}, end=${endYear}`)
  }

  return { startYear, endYear, concurrency, delayMs, mode, dryRun }
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

async function loadCheckpoint(): Promise<Set<string>> {
  try {
    const raw = await readFile(CHECKPOINT_FILE, 'utf8')
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

async function saveCheckpoint(processedIds: Set<string>): Promise<void> {
  await writeFile(CHECKPOINT_FILE, JSON.stringify([...processedIds], null, 2), 'utf8')
}

// ─── Discovery ────────────────────────────────────────────────────────────────

async function discoverAllPlayers(
  years: number[],
  concurrency: number,
  delayMs: number
): Promise<Map<string, DiscoveredPlayer>> {
  const allPlayers = new Map<string, DiscoveredPlayer>()

  const yearTasks = years.map((year) => async () => {
    const search = new URLSearchParams({
      reportname: 'PlayerWinsAndLosses',
      category: '%',
      year: String(year),
      level: 'worldtour',
      country: '%',
    })

    const firstPage = await fetchText(`/home/ReportPartial?${search.toString()}`, delayMs)
    if (!firstPage) return

    const totalRows = parseReportTotalRows(firstPage)
    const totalPages = Math.max(1, Math.ceil(totalRows / REPORT_PAGE_SIZE))

    const yearPlayers: DiscoveredPlayer[] = []
    for (const player of parsePlayerTableRows(firstPage)) {
      yearPlayers.push(player)
    }

    for (let page = 2; page <= totalPages; page++) {
      const pageSearch = new URLSearchParams({
        reportname: 'PlayerWinsAndLosses',
        category: '%',
        year: String(year),
        level: 'worldtour',
        country: '%',
        page: String(page),
        totalrows: String(totalRows),
        sortcolumn: 'Wins',
        sortdirection: 'desc',
      })
      const html = await fetchText(`/home/ReportPartial?${pageSearch.toString()}`, delayMs)
      for (const player of parsePlayerTableRows(html)) {
        yearPlayers.push(player)
      }
    }

    console.log(`Year ${year}: found ${yearPlayers.length} players`)
    return yearPlayers
  })

  const results = await runWithConcurrency(yearTasks, concurrency)
  for (const players of results) {
    if (!players) continue
    for (const player of players) {
      if (!allPlayers.has(player.id)) {
        allPlayers.set(player.id, player)
      }
    }
  }

  return allPlayers
}

async function collectTournamentIds(
  players: Map<string, DiscoveredPlayer>,
  years: number[],
  concurrency: number,
  delayMs: number
): Promise<Set<string>> {
  const tournamentIds = new Set<string>()

  // Take top 100 players by ID count (most frequently appearing = most active)
  const playerList = [...players.values()].slice(0, 100)
  console.log(`Collecting tournament IDs from ${playerList.length} top players...`)

  const tasks = playerList.flatMap((player) =>
    years.map((year) => async () => {
      const search = new URLSearchParams({
        playerid: player.id,
        year: String(year),
        level: 'worldtour',
        category: '%',
        round: '%',
        country: '%',
        partner: '%',
        rank: '%',
        hand: '%',
        height: '%',
        qualification: '%',
        startdate: `${year}-01-01`,
        enddate: `${year}-12-31`,
      })

      const html = await fetchText(`/home/playerdetails?${search.toString()}`, delayMs)
      if (!html) return

      const allMatchesTable = html.match(
        /<h5>All Matches:<\/h5>[\s\S]*?<table class="reportTable">([\s\S]*?)<\/table>/i
      )
      if (!allMatchesTable) return

      const ids = [...allMatchesTable[1].matchAll(/Tournament\?tournamentid=([^"]+)"/gi)].map(
        (m) => decodeHtmlEntities(m[1])
      )

      return ids
    })
  )

  const results = await runWithConcurrency(tasks, concurrency)
  for (const ids of results) {
    if (!ids) continue
    for (const id of ids) {
      tournamentIds.add(id)
    }
  }

  return tournamentIds
}

// ─── DB Upserts ───────────────────────────────────────────────────────────────

const usedSlugs = new Set<string>()

async function generateUniqueSlug(baseName: string, externalId: string): Promise<string> {
  const base = slugify(baseName)
  const suffix = externalId.slice(-6)
  let candidate = `${base}-${suffix}`

  // Check in-memory set first for speed
  if (!usedSlugs.has(candidate)) {
    // Then verify against DB
    const existing = await prisma.slPlayer.findUnique({ where: { slug: candidate } })
    if (!existing) {
      usedSlugs.add(candidate)
      return candidate
    }
  }

  // Try incrementing suffixes
  let counter = 2
  while (true) {
    const next = `${base}-${suffix}-${counter}`
    if (!usedSlugs.has(next)) {
      const existing = await prisma.slPlayer.findUnique({ where: { slug: next } })
      if (!existing) {
        usedSlugs.add(next)
        return next
      }
    }
    counter++
    if (counter > 999) return `${base}-${suffix}-${Date.now()}`
  }
}

async function upsertPlayer(player: {
  externalId: string
  name: string
  country: string
  category: string
}): Promise<void> {
  try {
    const existing = await prisma.slPlayer.findUnique({ where: { externalId: player.externalId } })

    if (existing) {
      await prisma.slPlayer.update({
        where: { externalId: player.externalId },
        data: { name: player.name, country: player.country, category: player.category },
      })
    } else {
      const slug = await generateUniqueSlug(player.name, player.externalId)
      await prisma.slPlayer.create({
        data: {
          externalId: player.externalId,
          name: player.name,
          slug,
          country: player.country,
          category: player.category,
          isActive: false,
        },
      })
    }
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('externalId') && msg.includes('column')) {
      console.warn('[upsertPlayer] externalId column not found — schema migration may be needed')
      return
    }
    throw err
  }
}

async function scrapeTournament(
  guid: string,
  dryRun: boolean,
  delayMs: number
): Promise<{ matchesUpserted: number; isNew: boolean }> {
  const html = await fetchText(`/Tournament?tournamentid=${encodeURIComponent(guid)}`, delayMs)
  if (!html) return { matchesUpserted: 0, isNew: false }

  const meta = parseTournamentMetadata(html)
  if (!meta) {
    console.warn(`[scrapeTournament] Could not parse metadata for ${guid}`)
    return { matchesUpserted: 0, isNew: false }
  }

  const matches = parseTournamentMatches(html)
  if (dryRun) {
    console.log(`[dry-run] Tournament: ${meta.name} (${meta.year}), ${matches.length} matches`)
    return { matchesUpserted: matches.length, isNew: true }
  }

  // Build tournament slug
  const tournamentSlug = slugify(meta.name) + '-' + meta.year

  // Upsert tournament
  let tournament: { id: string; createdAt: Date }
  const existingTournament = await prisma.slTournament.findUnique({ where: { externalId: guid } })
  const isNew = !existingTournament

  if (existingTournament) {
    tournament = existingTournament
  } else {
    // Ensure unique tournament slug
    let slugCandidate = tournamentSlug
    let slugCounter = 2
    while (await prisma.slTournament.findUnique({ where: { slug: slugCandidate } })) {
      slugCandidate = `${tournamentSlug}-${slugCounter++}`
    }

    tournament = await prisma.slTournament.create({
      data: {
        externalId: guid,
        name: meta.name,
        slug: slugCandidate,
        level: meta.level,
        location: meta.location,
        country: meta.country,
        startDate: new Date(meta.startDate),
        endDate: meta.endDate ? new Date(meta.endDate) : null,
        year: meta.year,
      },
    })
  }

  // Build round mappings per category
  const roundMappingsByCategory = new Map<string, Map<string, string>>()
  for (const category of new Set(matches.map((m) => m.category))) {
    const rawRounds = matches.filter((m) => m.category === category).map((m) => m.rawRound)
    roundMappingsByCategory.set(category, getRoundMappings(rawRounds))
  }

  let matchesUpserted = 0

  for (const match of matches) {
    const roundMapping = roundMappingsByCategory.get(match.category)
    const round = roundMapping?.get(match.rawRound) ?? match.rawRound

    // Upsert all players in the match
    for (const side of [match.side1, match.side2]) {
      for (const player of side) {
        if (player.id) {
          await upsertPlayer({
            externalId: player.id,
            name: player.name,
            country: player.country,
            category: match.category,
          })
        }
      }
    }

    const p1Raw = match.side1[0]
    const p2Raw = match.side2[0]
    if (!p1Raw?.id || !p2Raw?.id) continue

    const p1 = await prisma.slPlayer.findUnique({ where: { externalId: p1Raw.id } })
    const p2 = await prisma.slPlayer.findUnique({ where: { externalId: p2Raw.id } })
    if (!p1 || !p2) continue

    // Determine winner
    let winnerId: string | null = null
    if (match.winnerSide === 1) winnerId = p1.id
    else if (match.winnerSide === 2) winnerId = p2.id

    // Estimate match date
    const matchDate = estimateMatchDate(meta.startDate, meta.endDate, round)

    // Check for existing match (no @@unique on schema — use findFirst)
    const existing = await prisma.slMatch.findFirst({
      where: {
        tournamentId: tournament.id,
        round,
        category: match.category,
        player1Id: p1.id,
        player2Id: p2.id,
      },
    })

    if (!existing) {
      await prisma.slMatch.create({
        data: {
          tournamentId: tournament.id,
          round,
          date: new Date(matchDate),
          category: match.category,
          player1Id: p1.id,
          player2Id: p2.id,
          player1Partner: match.side1[1]?.name ?? null,
          player2Partner: match.side2[1]?.name ?? null,
          score: match.score,
          winnerId,
          durationMin: match.durationMin,
        },
      })
      matchesUpserted++
    }
  }

  // Update lastScrapedAt
  await prisma.slTournament.update({
    where: { id: tournament.id },
    data: { lastScrapedAt: new Date() },
  })

  return { matchesUpserted, isNew }
}

async function enrichPlayerProfile(externalId: string, delayMs: number): Promise<void> {
  const html = await fetchText(`/Player?playerid=${encodeURIComponent(externalId)}`, delayMs)
  if (!html) return

  const birthdayMatch = html.match(/Birthday:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i)
  const heightMatch = html.match(/Height:\s*(\d{2,3})\s*cm/i)
  const bioMatch = html.match(/<p[^>]*class="[^"]*text-dark[^"]*font-weight-normal[^"]*"[^>]*>([\s\S]*?)<\/p>/i)

  const birthDate = birthdayMatch
    ? new Date(`${birthdayMatch[3]}-${birthdayMatch[2].padStart(2, '0')}-${birthdayMatch[1].padStart(2, '0')}`)
    : undefined
  const height = heightMatch ? `${heightMatch[1]} cm` : undefined
  const bio = bioMatch ? cleanText(bioMatch[1]) : undefined

  if (birthDate || height || bio) {
    await prisma.slPlayer.update({
      where: { externalId },
      data: {
        ...(birthDate ? { birthDate } : {}),
        ...(height ? { height } : {}),
        ...(bio ? { bio } : {}),
      },
    })
  }
}

async function updateMatchCounts(): Promise<void> {
  console.log('Updating match counts...')

  await prisma.$executeRaw`
    UPDATE sl_player p
    SET match_count = (
      SELECT COUNT(*) FROM sl_match m
      WHERE m."player1Id" = p.id OR m."player2Id" = p.id
    )
  `

  await prisma.$executeRaw`
    UPDATE sl_player SET "isActive" = true WHERE match_count >= 5
  `

  await prisma.$executeRaw`
    UPDATE sl_player SET "isActive" = false WHERE match_count < 5
  `

  console.log('Match counts updated.')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { startYear, endYear, concurrency, delayMs, mode, dryRun } = parseArgs()
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)

  console.log(`SmashLab Global Sync — mode=${mode}, years=${startYear}-${endYear}, concurrency=${concurrency}, delayMs=${delayMs}${dryRun ? ', DRY RUN' : ''}`)

  // Create sync log
  const syncLog = dryRun
    ? null
    : await prisma.slSyncLog.create({
        data: {
          mode,
          status: 'running',
          yearsRange: `${startYear}-${endYear}`,
        },
      })

  let totalMatchesAdded = 0
  let totalTournamentsNew = 0
  let totalTournamentsTotal = 0
  let totalPlayersDiscovered = 0

  try {
    let tournamentGuids: Set<string>

    if (mode === 'incremental') {
      console.log('Incremental mode: loading tournaments from DB...')
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const dbTournaments = await prisma.slTournament.findMany({
        where: {
          OR: [
            { lastScrapedAt: null },
            { endDate: { gte: thirtyDaysAgo } },
          ],
          externalId: { not: null },
        },
        select: { externalId: true },
      })
      tournamentGuids = new Set(dbTournaments.map((t) => t.externalId!))
      console.log(`Incremental: ${tournamentGuids.size} tournaments to process`)
    } else {
      // Full mode: discover tournaments via JSON search API (fast)
      tournamentGuids = await discoverTournamentsViaSearch(startYear, endYear)
      console.log(`Discovered ${tournamentGuids.size} unique tournaments`)
    }

    // Filter by checkpoint
    const checkpoint = await loadCheckpoint()
    const toProcess = [...tournamentGuids].filter((id) => !checkpoint.has(id))
    console.log(`Processing ${toProcess.length} tournaments (${checkpoint.size} already done)`)

    totalTournamentsTotal = toProcess.length

    // Process in batches with concurrency
    const tasks = toProcess.map((guid, index) => async () => {
      console.log(`[${index + 1}/${toProcess.length}] Scraping tournament ${guid}`)

      try {
        const result = await scrapeTournament(guid, dryRun, delayMs)
        checkpoint.add(guid)

        if ((index + 1) % 10 === 0 && !dryRun) {
          await saveCheckpoint(checkpoint)
        }

        return result
      } catch (err) {
        console.error(`[scrapeTournament] Failed for ${guid}: ${(err as Error).message}`)
        return { matchesUpserted: 0, isNew: false }
      }
    })

    const results = await runWithConcurrency(tasks, concurrency)

    for (const result of results) {
      if (!result) continue
      totalMatchesAdded += result.matchesUpserted
      if (result.isNew) totalTournamentsNew++
    }

    // Save final checkpoint
    if (!dryRun) {
      await saveCheckpoint(checkpoint)
    }

    // Enrich player profiles (players without bio, priority: highest matchCount)
    if (!dryRun) {
      const playersToEnrich = await prisma.slPlayer.findMany({
        where: { bio: null, externalId: { not: null } },
        orderBy: { matchCount: 'desc' },
        take: 200,
        select: { externalId: true },
      })

      console.log(`Enriching profiles for ${playersToEnrich.length} players...`)

      const enrichTasks = playersToEnrich.map((p, i) => async () => {
        if (!p.externalId) return
        console.log(`Enriching player ${i + 1}/${playersToEnrich.length}: ${p.externalId}`)
        await enrichPlayerProfile(p.externalId, delayMs)
      })

      await runWithConcurrency(enrichTasks, Math.min(concurrency, 2))
    }

    // Update match counts
    if (!dryRun) {
      await updateMatchCounts()
    }

    // Update sync log
    if (syncLog && !dryRun) {
      await prisma.slSyncLog.update({
        where: { id: syncLog.id },
        data: {
          completedAt: new Date(),
          status: 'success',
          tournamentsTotal: totalTournamentsTotal,
          tournamentsNew: totalTournamentsNew,
          matchesAdded: totalMatchesAdded,
          playersDiscovered: totalPlayersDiscovered,
        },
      })
    }

    console.log('\n─── Sync Complete ───')
    console.log(`  Tournaments processed : ${totalTournamentsTotal}`)
    console.log(`  Tournaments new       : ${totalTournamentsNew}`)
    console.log(`  Matches added         : ${totalMatchesAdded}`)
    console.log(`  Players discovered    : ${totalPlayersDiscovered}`)
  } catch (err) {
    console.error('Sync failed:', err)

    if (syncLog && !dryRun) {
      await prisma.slSyncLog.update({
        where: { id: syncLog.id },
        data: {
          completedAt: new Date(),
          status: 'error',
          errorMessage: (err as Error).message,
        },
      })
    }

    throw err
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
