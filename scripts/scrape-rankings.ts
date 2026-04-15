/**
 * Scrape historical BWF Unified Rankings from badmintonstatistics.net
 * and store them in sl_ranking_snapshot.
 *
 * Endpoint:
 *   /home/RankingsPartial?date=YYYY-MM-DD&category=MS&country=%25
 *     &page=1&pagesize=100&type=unified
 *
 * The source's dropdown goes back to 1990-01-01 — we scrape every weekly
 * Monday in that range for every category. Dates that aren't in the
 * dropdown (i.e. not published) return HTTP 500 and are skipped.
 *
 * Usage:
 *   npx tsx scripts/scrape-rankings.ts                    # full history, all cats
 *   npx tsx scripts/scrape-rankings.ts --priority         # only event-week snapshots
 *   npx tsx scripts/scrape-rankings.ts --since 2020-01-01 # from a cutoff
 *   npx tsx scripts/scrape-rankings.ts --date 2024-04-29  # one specific week
 */
import { PrismaClient } from '@prisma/client'
import { promisify } from 'util'
import { execFile } from 'child_process'

const prisma = new PrismaClient()
const execFileAsync = promisify(execFile)

const BASE_URL = 'https://www.badmintonstatistics.net'
const USER_AGENT = 'Mozilla/5.0 (compatible; SmashLab/1.0)'
const CATEGORIES = ['MS', 'WS', 'MD', 'WD', 'XD'] as const
const PAGE_SIZES = [100, 50, 25] as const // strict validator; try largest first
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '300', 10)

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

async function fetchText(path: string, retries = 2): Promise<{ status: number; body: string }> {
  const url = new URL(path, BASE_URL).toString()
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { stdout } = await execFileAsync(
        'curl',
        [
          '-sS',
          '-A', USER_AGENT,
          '-H', `Referer: ${BASE_URL}/Rankings`,
          '-w', '\n---HTTP:%{http_code}---',
          '--max-time', '30',
          url,
        ],
        { maxBuffer: 24 * 1024 * 1024 }
      )
      const m = stdout.match(/---HTTP:(\d+)---$/)
      const status = m ? parseInt(m[1], 10) : 0
      const body = m ? stdout.slice(0, m.index).replace(/\n$/, '') : stdout
      return { status, body }
    } catch (err) {
      if (attempt === retries) return { status: 0, body: '' }
      await sleep([1500, 5000][attempt] ?? 5000)
    }
  }
  return { status: 0, body: '' }
}

type ParsedRow = {
  category: string
  rank: number
  points: number | null
  externalIds: string[] // 1 for singles, 2 for doubles (in order as listed)
}

function parseRankingFragment(html: string, category: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  // Each <tr> … <td>players</td><td>rank</td><td>cat</td><td>points</td></tr>
  const trRe = /<tr>\s*([\s\S]*?)\s*<\/tr>/g
  let m: RegExpExecArray | null
  while ((m = trRe.exec(html))) {
    const cell = m[1]
    const ids = [...cell.matchAll(/playerid=(\d+)/g)].map(x => x[1])
    if (ids.length === 0) continue
    const rankMatch = cell.match(/<\/a><\/td>\s*<td>(\d+)<\/td>/)
    if (!rankMatch) continue
    const rank = parseInt(rankMatch[1], 10)
    const pointsMatch = cell.match(/>(\d+)<\/a>\s*<\/td>\s*<\/tr>/)
      || cell.match(/<td>(\d+)<\/td>\s*<\/tr>/)
    const points = pointsMatch ? parseInt(pointsMatch[1], 10) : null
    rows.push({ category, rank, points, externalIds: ids })
  }
  return rows
}

async function fetchAllPagesForDateCategory(
  date: string,
  category: string,
  maxRank: number
): Promise<ParsedRow[]> {
  // pagesize=100 → 1 request for top 100. Try larger pages first.
  for (const ps of PAGE_SIZES) {
    const pagesNeeded = Math.ceil(maxRank / ps)
    const out: ParsedRow[] = []
    let ok = true
    for (let page = 1; page <= pagesNeeded; page++) {
      await sleep(DELAY_MS)
      const path = `/home/RankingsPartial?date=${date}&category=${category}&country=%25&page=${page}&pagesize=${ps}&type=unified`
      const { status, body } = await fetchText(path)
      if (status !== 200) { ok = false; break }
      const parsed = parseRankingFragment(body, category)
      if (parsed.length === 0) break
      out.push(...parsed)
      if (parsed.length < ps) break // last page
    }
    if (ok) return out
  }
  return []
}

async function loadExternalIdToPlayerId(): Promise<Map<string, string>> {
  const rows = await prisma.slPlayer.findMany({
    where: { externalId: { not: null } },
    select: { id: true, externalId: true },
  })
  const map = new Map<string, string>()
  for (const r of rows) if (r.externalId) map.set(r.externalId, r.id)
  return map
}

async function storeSnapshot(
  date: Date,
  rows: ParsedRow[],
  externalToInternal: Map<string, string>
) {
  if (rows.length === 0) return 0
  const records: { snapshotDate: Date; category: string; playerId: string; pairKey: string | null; rank: number; points: number | null }[] = []
  for (const r of rows) {
    const pairKey = r.externalIds.length === 2
      ? r.externalIds
          .map(e => externalToInternal.get(e) || `ext:${e}`)
          .sort()
          .join('|')
      : null
    for (const ext of r.externalIds) {
      const playerId = externalToInternal.get(ext)
      if (!playerId) continue // unknown player in our DB — skip
      records.push({
        snapshotDate: date,
        category: r.category,
        playerId,
        pairKey,
        rank: r.rank,
        points: r.points,
      })
    }
  }
  if (records.length === 0) return 0
  // Upsert by (snapshotDate, category, playerId). Deletes + inserts would
  // be simpler but not atomic; use per-row upserts for correctness.
  let saved = 0
  for (const rec of records) {
    await prisma.slRankingSnapshot.upsert({
      where: {
        snapshotDate_category_playerId: {
          snapshotDate: rec.snapshotDate,
          category: rec.category,
          playerId: rec.playerId,
        },
      },
      update: { rank: rec.rank, points: rec.points, pairKey: rec.pairKey },
      create: rec,
    })
    saved++
  }
  return saved
}

async function fetchDropdownDates(): Promise<string[]> {
  const { body } = await fetchText('/Rankings')
  const dates = [...body.matchAll(/<option [^>]*value="(\d{4}-\d{2}-\d{2})"/g)].map(m => m[1])
  return [...new Set(dates)].sort()
}

async function eventPriorityDates(): Promise<string[]> {
  const events = await prisma.slTeamEvent.findMany({ select: { year: true, startDate: true } })
  const all = await fetchDropdownDates()
  const out = new Set<string>()
  for (const ev of events) {
    // Pick the latest dropdown date strictly before the event's start
    // (or May 1 of its year if startDate is null).
    const cutoff = ev.startDate || new Date(Date.UTC(ev.year, 4, 1))
    const cutoffIso = cutoff.toISOString().slice(0, 10)
    const candidate = [...all].reverse().find(d => d < cutoffIso)
    if (candidate) out.add(candidate)
  }
  return [...out].sort()
}

async function main() {
  const args = process.argv.slice(2)
  const priorityMode = args.includes('--priority')
  const sinceIdx = args.indexOf('--since')
  const dateIdx = args.indexOf('--date')
  const explicitDate = dateIdx > 0 ? args[dateIdx + 1] : null
  const sinceDate = sinceIdx > 0 ? args[sinceIdx + 1] : null
  const topN = parseInt(process.env.SCRAPE_TOP_N || '100', 10)

  console.log(`Loading player externalId → id map...`)
  const externalToInternal = await loadExternalIdToPlayerId()
  console.log(`  ${externalToInternal.size} players indexed.`)

  let dates: string[]
  if (explicitDate) {
    dates = [explicitDate]
  } else if (priorityMode) {
    dates = await eventPriorityDates()
    console.log(`Priority mode: ${dates.length} event-week snapshots.`)
  } else {
    console.log(`Fetching dropdown dates from /Rankings...`)
    dates = await fetchDropdownDates()
    if (sinceDate) dates = dates.filter(d => d >= sinceDate)
    console.log(`  ${dates.length} weekly snapshots available.`)
  }

  let totalSaved = 0
  let totalSkipped = 0
  for (const date of dates) {
    let perDate = 0
    for (const cat of CATEGORIES) {
      const rows = await fetchAllPagesForDateCategory(date, cat, topN)
      if (rows.length === 0) {
        totalSkipped++
        continue
      }
      const saved = await storeSnapshot(new Date(date + 'T00:00:00Z'), rows, externalToInternal)
      perDate += saved
    }
    totalSaved += perDate
    console.log(`${date}: ${perDate} rows saved`)
  }

  console.log(`\n✅ Done. ${totalSaved} rows total; ${totalSkipped} (date, category) combos skipped.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
