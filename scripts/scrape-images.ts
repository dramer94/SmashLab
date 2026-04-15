/**
 * Fetches player photos from Wikipedia API and updates imageUrl in DB.
 * Wikipedia freely provides CC-licensed images for most top players.
 *
 * Usage: node --experimental-strip-types scripts/scrape-images.ts
 */

import { prisma } from '../lib/prisma.ts'

const DELAY = 300
const BATCH = 50   // Wikipedia API allows up to 50 titles per request
const MIN_MATCHES = 20  // only fetch images for players with 20+ matches

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function toWikiTitle(name: string): string {
  // Convert "LEE Chong Wei" → "Lee Chong Wei"
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

async function fetchWikiImages(titles: string[]): Promise<Map<string, string>> {
  const joined = titles.map(encodeURIComponent).join('|')
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${joined}&prop=pageimages&format=json&pithumbsize=300&redirects=1`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SmashLab/1.0 (badminton analytics; contact via github)' }
    })
    if (!res.ok) return new Map()
    const data = await res.json() as {
      query: {
        pages: Record<string, { title: string; thumbnail?: { source: string } }>
        redirects?: { from: string; to: string }[]
        normalized?: { from: string; to: string }[]
      }
    }

    const result = new Map<string, string>()
    const pages = data.query?.pages ?? {}
    const redirectMap = new Map<string, string>()

    // Build redirect map (normalized + redirects both go from → to)
    for (const n of data.query?.normalized ?? []) redirectMap.set(n.to, n.from)
    for (const r of data.query?.redirects ?? []) redirectMap.set(r.to, r.from)

    for (const page of Object.values(pages)) {
      if (page.thumbnail?.source) {
        // Map back to original title
        const originalTitle = redirectMap.get(page.title) ?? page.title
        result.set(originalTitle, page.thumbnail.source)
      }
    }
    return result
  } catch {
    return new Map()
  }
}

async function main() {
  console.log('SmashLab — Wikipedia Image Scraper')

  // Get all active players without images, sorted by matchCount
  const players = await prisma.slPlayer.findMany({
    where: {
      isActive: true,
      imageUrl: null,
      matchCount: { gte: MIN_MATCHES },
    },
    orderBy: { matchCount: 'desc' },
    select: { id: true, name: true, country: true, matchCount: true },
  })

  console.log(`${players.length} players need images (min ${MIN_MATCHES} matches, no image yet)`)

  let updated = 0
  let notFound = 0

  // Process in batches of 50
  for (let i = 0; i < players.length; i += BATCH) {
    const batch = players.slice(i, i + BATCH)
    const titleToId = new Map<string, string>()
    const titles: string[] = []

    for (const p of batch) {
      const title = toWikiTitle(p.name)
      titles.push(title)
      titleToId.set(title, p.id)
    }

    const images = await fetchWikiImages(titles)

    for (const [title, imageUrl] of images) {
      const id = titleToId.get(title)
      if (!id) continue
      await prisma.slPlayer.update({ where: { id }, data: { imageUrl } })
      updated++
    }
    notFound += batch.length - images.size

    const pct = Math.round(((i + batch.length) / players.length) * 100)
    console.log(`  ${i + batch.length}/${players.length} (${pct}%) — +${images.size} images this batch`)
    await sleep(DELAY)
  }

  console.log(`\nDone. ${updated} images added, ${notFound} players not found on Wikipedia.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
