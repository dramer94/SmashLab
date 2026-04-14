import { readFile, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const BASE_URL = "https://www.badmintonstatistics.net"
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
const REPORT_PAGE_SIZE = 25
const execFileAsync = promisify(execFile)

type NullableString = string | null

interface PlayerSeed {
  name: string
  slug: string
  country: string
  birthDate: NullableString
  height: NullableString
  playStyle: NullableString
  category: string
  bwfId: NullableString
  worldRanking: number | null
  bio: NullableString
  imageUrl: NullableString
  isActive: boolean
}

interface TournamentSeed {
  name: string
  slug: string
  level: string
  location: NullableString
  country: NullableString
  startDate: string
  endDate: NullableString
  year: number
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

interface MatchSeed {
  tournament: string
  round: string
  date: string
  category: string
  player1: string
  player2: string
  player1Partner?: string
  player2Partner?: string
  score: string
  winner: NullableString
  durationMin?: number
}

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

interface ParsedTournament {
  tournament: ScrapedTournamentMeta
  matches: MatchCandidate[]
}

const COUNTRY_CODE_MAP: Record<string, string> = {
  Australia: "AUS",
  Belgium: "BEL",
  Canada: "CAN",
  China: "CHN",
  "Chinese Taipei": "TPE",
  Denmark: "DEN",
  England: "ENG",
  France: "FRA",
  Germany: "GER",
  "Great Britain": "GBR",
  "Hong Kong": "HKG",
  India: "IND",
  Indonesia: "INA",
  Ireland: "IRL",
  Japan: "JPN",
  Korea: "KOR",
  Malaysia: "MAS",
  Netherlands: "NED",
  Poland: "POL",
  Scotland: "SCO",
  Singapore: "SGP",
  Spain: "ESP",
  Switzerland: "SUI",
  Thailand: "THA",
  "U.S.A.": "USA",
  USA: "USA",
}

function parseArgs() {
  const nowYear = new Date().getUTCFullYear()
  let startYear = nowYear - 1
  let endYear = nowYear
  let delayMs = 150

  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index]
    const next = process.argv[index + 1]

    if (arg === "--start-year" && next) {
      startYear = Number(next)
      index += 1
      continue
    }

    if (arg === "--end-year" && next) {
      endYear = Number(next)
      index += 1
      continue
    }

    if (arg === "--delay-ms" && next) {
      delayMs = Number(next)
      index += 1
    }
  }

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || startYear > endYear) {
    throw new Error(`Invalid year range: start=${startYear}, end=${endYear}`)
  }

  return { startYear, endYear, delayMs }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchText(relativeUrl: string, delayMs: number) {
  await sleep(delayMs)

  const url = new URL(relativeUrl, BASE_URL)
  const { stdout } = await execFileAsync(
    "curl",
    ["-sS", "-A", USER_AGENT, url.toString()],
    { maxBuffer: 24 * 1024 * 1024 }
  )

  return stdout
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  }

  return value
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, num) => String.fromCodePoint(Number.parseInt(num, 16)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name.toLowerCase()] ?? `&${name};`)
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ""))
}

function cleanText(value: string) {
  return stripTags(value)
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim()
}

function canonicalNameKey(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ")
}

function slugify(value: string) {
  return decodeHtmlEntities(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function ensureUniqueSlug(baseSlug: string, nameKey: string, playersBySlug: Map<string, PlayerSeed>) {
  if (!playersBySlug.has(baseSlug)) {
    return baseSlug
  }

  const existing = playersBySlug.get(baseSlug)
  if (existing && canonicalNameKey(existing.name) === nameKey) {
    return baseSlug
  }

  let index = 2
  while (playersBySlug.has(`${baseSlug}-${index}`)) {
    index += 1
  }

  return `${baseSlug}-${index}`
}

function toIsoDate(day: string, month: string, year: string) {
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}

function parseSlashDateRange(value: string) {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})-(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) {
    return null
  }

  return {
    startDate: toIsoDate(match[1], match[2], match[3]),
    endDate: toIsoDate(match[4], match[5], match[6]),
  }
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function mapCountry(title: string) {
  return COUNTRY_CODE_MAP[decodeHtmlEntities(title).trim()] ?? decodeHtmlEntities(title).trim().toUpperCase()
}

function mapTournamentLevel(raw: string) {
  const text = cleanText(raw)

  if (/Super 1000/i.test(text)) return "Super 1000"
  if (/Super 750/i.test(text)) return "Super 750"
  if (/Super 500/i.test(text)) return "Super 500"
  if (/Super 300/i.test(text)) return "Super 300"
  if (/Super 100/i.test(text)) return "Super 100"
  if (/World Tour Finals|Olympic|World Championships|World Championship/i.test(text)) return "Major"
  if (/Asia Championships|Asian Championship|Badminton Asia/i.test(text)) return "Major"
  if (/Europe Championships|European Championship|Badminton Europe/i.test(text)) return "Major"
  if (/Thomas Cup|Uber Cup|Sudirman Cup|BWF Team/i.test(text)) return "Team"
  if (/Major/i.test(text)) return "Major"

  return text
}

function extractRows(tableHtml: string) {
  return [...tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((match) => match[1])
}

function extractCells(rowHtml: string) {
  return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1])
}

function extractPlayersFromCell(cellHtml: string) {
  const countryTitles = [...cellHtml.matchAll(/<img[^>]*title="([^"]+)"/gi)].map((match) => mapCountry(match[1]))
  const links = [...cellHtml.matchAll(/<a href="Player\?playerid=([^"]+)">([\s\S]*?)<\/a>/gi)]

  return links.map((match, index) => ({
    id: decodeHtmlEntities(match[1]),
    name: cleanText(match[2]),
    country: countryTitles[index] ?? "UNK",
  }))
}

function normalizeScore(score: string) {
  return cleanText(score).replace(/\s*\/\s*/g, " ")
}

function inferWinnerSide(side1Html: string, side2Html: string): 1 | 2 | null {
  const side1Bold = /<b>/i.test(side1Html)
  const side2Bold = /<b>/i.test(side2Html)

  if (side1Bold && !side2Bold) return 1
  if (side2Bold && !side1Bold) return 2
  return 1
}

function getRoundMappings(rawRounds: string[]) {
  const unique = new Set(rawRounds)
  const mapping = new Map<string, string>()

  if (unique.has("Final")) mapping.set("Final", "F")
  if (unique.has("Semi-final")) mapping.set("Semi-final", "SF")
  if (unique.has("Quarter-final")) mapping.set("Quarter-final", "QF")
  if (unique.has("Group")) mapping.set("Group", "Group")

  if (unique.has("Round 2")) {
    mapping.set("Round 2", "R16")
    mapping.set("Round 1", "R32")
  } else if (unique.has("Quarter-final")) {
    mapping.set("Round 1", "R16")
  } else if (unique.has("Semi-final")) {
    mapping.set("Round 1", "QF")
  }

  if (unique.has("Round 3")) {
    mapping.set("Round 3", "R16")
    mapping.set("Round 2", "R32")
    mapping.set("Round 1", "R64")
  }

  return mapping
}

function estimateMatchDate(tournament: TournamentSeed, roundCode: string) {
  const offsets: Record<string, number> = {
    F: 0,
    SF: -1,
    QF: -2,
    R16: -3,
    R32: -4,
    R64: -5,
    Group: 0,
  }

  const endDate = tournament.endDate ?? tournament.startDate
  const tentative = addDays(endDate, offsets[roundCode] ?? 0)

  if (tentative < tournament.startDate) {
    return tournament.startDate
  }

  if (tournament.endDate && tentative > tournament.endDate) {
    return tournament.endDate
  }

  return tentative
}

function tournamentKey(name: string, year: number) {
  return `${canonicalNameKey(name)}::${year}`
}

function parseReportTotalRows(html: string) {
  const match = html.match(/id="report_totalRows"[^>]*value="(\d+)"/i)
  return match ? Number(match[1]) : 0
}

function parsePlayerTableRows(html: string) {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)
  if (!tbodyMatch) {
    return []
  }

  const rows: DiscoveredPlayer[] = []

  for (const row of extractRows(tbodyMatch[1])) {
    const cells = extractCells(row)
    if (cells.length < 2) {
      continue
    }

    const category = cleanText(cells[1])
    const players = extractPlayersFromCell(cells[0]).filter((player) => player.country === "MAS")

    for (const player of players) {
      rows.push({
        id: player.id,
        name: player.name,
        country: player.country,
        category,
      })
    }
  }

  return rows
}

async function fetchReportPage(year: number, page: number, totalRows: number, delayMs: number) {
  const search = new URLSearchParams({
    reportname: "PlayerWinsAndLosses",
    category: "%",
    year: String(year),
    level: "worldtour",
    country: "Malaysia",
  })

  if (page > 1) {
    search.set("page", String(page))
    search.set("totalrows", String(totalRows))
    search.set("sortcolumn", "Wins")
    search.set("sortdirection", "desc")
  }

  return fetchText(`/home/ReportPartial?${search.toString()}`, delayMs)
}

async function discoverMalaysianPlayers(years: number[], delayMs: number) {
  const players = new Map<string, DiscoveredPlayer>()

  for (const year of years) {
    const firstPage = await fetchReportPage(year, 1, 0, delayMs)
    const totalRows = parseReportTotalRows(firstPage)
    const totalPages = Math.max(1, Math.ceil(totalRows / REPORT_PAGE_SIZE))

    for (const player of parsePlayerTableRows(firstPage)) {
      players.set(player.id, player)
    }

    for (let page = 2; page <= totalPages; page += 1) {
      const html = await fetchReportPage(year, page, totalRows, delayMs)
      for (const player of parsePlayerTableRows(html)) {
        players.set(player.id, player)
      }
    }
  }

  return players
}

async function fetchPlayerDetails(playerId: string, year: number, delayMs: number) {
  const search = new URLSearchParams({
    playerid: playerId,
    year: String(year),
    level: "worldtour",  // worldtour includes World/Regional Championships per badmintonstatistics.net
    category: "%",
    round: "%",
    country: "%",
    partner: "%",
    rank: "%",
    hand: "%",
    height: "%",
    qualification: "%",
    startdate: `${year}-01-01`,
    enddate: `${year}-12-31`,
  })

  return fetchText(`/home/playerdetails?${search.toString()}`, delayMs)
}

function extractTournamentIdsFromPlayerDetails(html: string) {
  const allMatchesTable = html.match(/<h5>All Matches:<\/h5>[\s\S]*?<table class="reportTable">([\s\S]*?)<\/table>/i)
  if (!allMatchesTable) {
    return []
  }

  return [...allMatchesTable[1].matchAll(/Tournament\?tournamentid=([^"]+)"/gi)].map((match) => decodeHtmlEntities(match[1]))
}

async function discoverTournamentIds(players: Map<string, DiscoveredPlayer>, years: number[], delayMs: number) {
  const tournamentIds = new Set<string>()
  const orderedPlayers = [...players.values()].sort((left, right) => left.name.localeCompare(right.name))

  for (const [index, player] of orderedPlayers.entries()) {
    console.log(`Scraping player ${index + 1}/${orderedPlayers.length}: ${player.name}`)

    for (const year of years) {
      const html = await fetchPlayerDetails(player.id, year, delayMs)
      for (const tournamentId of extractTournamentIdsFromPlayerDetails(html)) {
        tournamentIds.add(tournamentId)
      }
    }
  }

  return [...tournamentIds].sort()
}

function parseTournamentMetadata(html: string) {
  const nameMatch = html.match(/Tournament Name:<\/b>\s*([^<]+)<br/i)
  const dateMatch = html.match(/Tournament Dates:<\/b>\s*([^<]+)<br/i)
  const locationMatch = html.match(/Location:<\/b>\s*([^<]+)<br/i)
  const categoryMatch = html.match(/Category:<\/b>\s*([^<\n]+)/i)

  if (!nameMatch || !dateMatch || !locationMatch || !categoryMatch) {
    return null
  }

  const name = cleanText(nameMatch[1])
  const dates = parseSlashDateRange(cleanText(dateMatch[1]))
  if (!dates) {
    return null
  }

  const locationValue = cleanText(locationMatch[1])
  const locationParts = locationValue.split(",").map((part) => part.trim()).filter(Boolean)
  const country = locationParts[0] ?? null
  const location = locationParts.slice(1).join(", ") || null
  const level = mapTournamentLevel(categoryMatch[1])
  const year = Number(dates.startDate.slice(0, 4))

  return {
    name,
    level,
    location,
    country,
    startDate: dates.startDate,
    endDate: dates.endDate,
    year,
  }
}

function parseTournamentMatches(html: string) {
  const matchesSection = html.match(/<h5>Matches<\/h5>[\s\S]*?<table class="reportTable">([\s\S]*?)<\/table>/i)
  if (!matchesSection) {
    return []
  }

  const candidates: MatchCandidate[] = []
  let currentCategory = ""

  for (const row of extractRows(matchesSection[1])) {
    const categoryMatch = row.match(/class="reportSubHeader">([^<]+)</i)
    if (categoryMatch) {
      currentCategory = cleanText(categoryMatch[1])
      continue
    }

    const cells = extractCells(row)
    if (cells.length !== 7 || !currentCategory) {
      continue
    }

    const rawRound = cleanText(cells[0])
    if (/qual/i.test(currentCategory) || /qualification/i.test(rawRound)) {
      continue
    }

    const side1 = extractPlayersFromCell(cells[2])
    const side2 = extractPlayersFromCell(cells[4])
    if (side1.length === 0 || side2.length === 0) {
      continue
    }

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

function parseTournamentPage(html: string) {
  const tournament = parseTournamentMetadata(html)
  if (!tournament) {
    return null
  }

  return {
    tournament,
    matches: parseTournamentMatches(html),
  }
}

function mergePlayerSeed(
  extracted: ExtractedPlayer,
  category: string,
  playersBySlug: Map<string, PlayerSeed>,
  playerSlugByKey: Map<string, string>,
  existingPlayersByKey: Map<string, PlayerSeed>
) {
  const key = canonicalNameKey(extracted.name)
  const existing = existingPlayersByKey.get(key)
  const existingSlug = playerSlugByKey.get(key) ?? existing?.slug
  const baseSlug = existingSlug ?? slugify(extracted.name)
  const slug = ensureUniqueSlug(baseSlug, key, playersBySlug)
  const current = playersBySlug.get(slug)

  if (current) {
    playerSlugByKey.set(key, slug)
    return slug
  }

  const country = existing?.country ?? extracted.country
  const seed: PlayerSeed = {
    name: existing?.name ?? extracted.name,
    slug,
    country,
    birthDate: existing?.birthDate ?? null,
    height: existing?.height ?? null,
    playStyle: existing?.playStyle ?? null,
    category: existing?.category ?? category,
    bwfId: existing?.bwfId ?? null,
    worldRanking: existing?.worldRanking ?? null,
    bio: existing?.bio ?? null,
    imageUrl: existing?.imageUrl ?? null,
    isActive: existing?.isActive ?? country === "MAS",
  }

  playersBySlug.set(slug, seed)
  playerSlugByKey.set(key, slug)
  return slug
}

function buildMatchSeeds(
  parsed: ParsedTournament,
  tournament: TournamentSeed,
  playersBySlug: Map<string, PlayerSeed>,
  playerSlugByKey: Map<string, string>,
  existingPlayersByKey: Map<string, PlayerSeed>
) {
  const roundMappingsByCategory = new Map<string, Map<string, string>>()

  for (const category of new Set(parsed.matches.map((match) => match.category))) {
    const rawRounds = parsed.matches.filter((match) => match.category === category).map((match) => match.rawRound)
    roundMappingsByCategory.set(category, getRoundMappings(rawRounds))
  }

  const matches: MatchSeed[] = []

  for (const match of parsed.matches) {
    const roundMapping = roundMappingsByCategory.get(match.category)
    const round = roundMapping?.get(match.rawRound) ?? match.rawRound

    const player1Slug = mergePlayerSeed(match.side1[0], match.category, playersBySlug, playerSlugByKey, existingPlayersByKey)
    const player2Slug = mergePlayerSeed(match.side2[0], match.category, playersBySlug, playerSlugByKey, existingPlayersByKey)

    if (match.side1[1]) {
      mergePlayerSeed(match.side1[1], match.category, playersBySlug, playerSlugByKey, existingPlayersByKey)
    }

    if (match.side2[1]) {
      mergePlayerSeed(match.side2[1], match.category, playersBySlug, playerSlugByKey, existingPlayersByKey)
    }

    matches.push({
      tournament: tournament.slug,
      round,
      date: estimateMatchDate(tournament, round),
      category: match.category,
      player1: player1Slug,
      player2: player2Slug,
      player1Partner: match.side1[1]?.name,
      player2Partner: match.side2[1]?.name,
      score: match.score,
      winner:
        match.winnerSide === 1
          ? player1Slug
          : match.winnerSide === 2
            ? player2Slug
            : null,
      durationMin: match.durationMin ?? undefined,
    })
  }

  return matches
}

function sortPlayers(players: PlayerSeed[]) {
  return [...players].sort((left, right) => {
    if (left.country === "MAS" && right.country !== "MAS") return -1
    if (left.country !== "MAS" && right.country === "MAS") return 1
    if (left.category !== right.category) return left.category.localeCompare(right.category)
    return left.name.localeCompare(right.name)
  })
}

function sortTournaments(tournaments: TournamentSeed[]) {
  return [...tournaments].sort((left, right) => {
    if (left.startDate !== right.startDate) return right.startDate.localeCompare(left.startDate)
    return left.name.localeCompare(right.name)
  })
}

function sortMatches(matches: MatchSeed[]) {
  const roundOrder: Record<string, number> = {
    R64: 1,
    R32: 2,
    R16: 3,
    QF: 4,
    SF: 5,
    F: 6,
    Group: 7,
  }

  return [...matches].sort((left, right) => {
    if (left.date !== right.date) return right.date.localeCompare(left.date)
    if (left.tournament !== right.tournament) return left.tournament.localeCompare(right.tournament)
    const leftOrder = roundOrder[left.round] ?? 99
    const rightOrder = roundOrder[right.round] ?? 99
    if (leftOrder !== rightOrder) return rightOrder - leftOrder
    return left.player1.localeCompare(right.player1)
  })
}

// Convert badmintonstatistics.net name format (e.g. "LEE Zii Jia", "Aaron CHIA") to Wikipedia search term
function toWikipediaSearchName(name: string) {
  // Names come in two formats:
  // "LEE Zii Jia" → "Lee Zii Jia" (last name all caps followed by given name)
  // "Aaron CHIA" → "Aaron Chia" (given name followed by all-caps last name)
  const words = name.trim().split(/\s+/)
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
}

// Wikipedia image name cache to avoid repeated lookups
const wikiImageCache = new Map<string, string | null>()

async function fetchWikipediaImage(playerName: string, delayMs: number): Promise<string | null> {
  const searchName = toWikipediaSearchName(playerName)
  if (wikiImageCache.has(searchName)) return wikiImageCache.get(searchName) ?? null

  try {
    const encodedTitle = encodeURIComponent(searchName.replace(/ /g, "_"))
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodedTitle}&prop=pageimages&format=json&pithumbsize=400&redirects=1`
    await sleep(delayMs)

    const { stdout } = await execFileAsync("curl", ["-sS", "--max-time", "10", url], { maxBuffer: 1024 * 1024 })
    const data = JSON.parse(stdout) as {
      query: { pages: Record<string, { thumbnail?: { source: string } }> }
    }
    const pages = Object.values(data.query.pages)
    const imageUrl = pages[0]?.thumbnail?.source ?? null
    wikiImageCache.set(searchName, imageUrl)
    return imageUrl
  } catch {
    wikiImageCache.set(searchName, null)
    return null
  }
}

async function loadJsonFile<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as T
}

async function writeJsonFile(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function main() {
  const { startYear, endYear, delayMs } = parseArgs()
  const years = Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index)

  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const dataDir = path.resolve(scriptDir, "../prisma/data")
  const playersPath = path.join(dataDir, "players.json")
  const tournamentsPath = path.join(dataDir, "tournaments.json")
  const matchesPath = path.join(dataDir, "matches.json")

  console.log(`Syncing SmashLab seed data from badmintonstatistics.net for ${startYear}-${endYear}`)

  const [existingPlayers, existingTournaments, existingMatches] = await Promise.all([
    loadJsonFile<PlayerSeed[]>(playersPath),
    loadJsonFile<TournamentSeed[]>(tournamentsPath),
    loadJsonFile<MatchSeed[]>(matchesPath),
  ])

  const playersBySlug = new Map(existingPlayers.map((player) => [player.slug, { ...player }]))
  const playerSlugByKey = new Map(existingPlayers.map((player) => [canonicalNameKey(player.name), player.slug]))
  const existingPlayersByKey = new Map(existingPlayers.map((player) => [canonicalNameKey(player.name), player]))
  const existingTournamentsByKey = new Map(existingTournaments.map((tournament) => [tournamentKey(tournament.name, tournament.year), tournament]))

  const discoveredPlayers = await discoverMalaysianPlayers(years, delayMs)
  console.log(`Discovered ${discoveredPlayers.size} Malaysian players with World Tour matches`)

  const tournamentIds = await discoverTournamentIds(discoveredPlayers, years, delayMs)
  console.log(`Discovered ${tournamentIds.length} tournaments to import`)

  const scrapedTournaments = new Map<string, TournamentSeed>()
  const scrapedMatches: MatchSeed[] = []

  for (const [index, tournamentId] of tournamentIds.entries()) {
    console.log(`Scraping tournament ${index + 1}/${tournamentIds.length}: ${tournamentId}`)

    const html = await fetchText(`/Tournament?tournamentid=${encodeURIComponent(tournamentId)}`, delayMs)
    const parsed = parseTournamentPage(html)
    if (!parsed) {
      console.warn(`Skipping tournament ${tournamentId}: could not parse metadata`)
      continue
    }

    const key = tournamentKey(parsed.tournament.name, parsed.tournament.year)
    const existingTournament = existingTournamentsByKey.get(key)
    const slug = existingTournament?.slug ?? slugify(parsed.tournament.name)
    const tournament: TournamentSeed = {
      ...parsed.tournament,
      slug,
    }

    scrapedTournaments.set(key, tournament)
    scrapedMatches.push(
      ...buildMatchSeeds(parsed, tournament, playersBySlug, playerSlugByKey, existingPlayersByKey)
    )
  }

  const preservedTournaments = existingTournaments.filter((tournament) => tournament.year < startYear)
  const preservedMatches = existingMatches.filter((match) => Number(match.date.slice(0, 4)) < startYear)

  // Fetch Wikipedia images for Malaysian players that don't have one yet
  const masPlayers = [...playersBySlug.values()].filter((p) => p.country === "MAS" && (!p.imageUrl || p.imageUrl === "null"))
  console.log(`Fetching Wikipedia images for ${masPlayers.length} Malaysian players without images...`)
  let imagesFetched = 0
  for (const player of masPlayers) {
    const imageUrl = await fetchWikipediaImage(player.name, delayMs)
    if (imageUrl) {
      player.imageUrl = imageUrl
      imagesFetched++
      console.log(`  Image found: ${player.name}`)
    }
  }
  console.log(`Wikipedia images: ${imagesFetched}/${masPlayers.length} found`)

  const nextPlayers = sortPlayers([...playersBySlug.values()])
  const nextTournaments = sortTournaments([
    ...preservedTournaments,
    ...scrapedTournaments.values(),
  ])
  const nextMatches = sortMatches([
    ...preservedMatches,
    ...scrapedMatches,
  ])

  await Promise.all([
    writeJsonFile(playersPath, nextPlayers),
    writeJsonFile(tournamentsPath, nextTournaments),
    writeJsonFile(matchesPath, nextMatches),
  ])

  console.log(`Wrote ${nextPlayers.length} players`)
  console.log(`Wrote ${nextTournaments.length} tournaments`)
  console.log(`Wrote ${nextMatches.length} matches`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
