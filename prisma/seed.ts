import { PrismaClient } from '@prisma/client'
import players from './data/players.json'
import tournaments from './data/tournaments.json'
import matches from './data/matches.json'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding SmashLab database...')

  // Clear existing data
  await prisma.slMatch.deleteMany()
  await prisma.slTournament.deleteMany()
  await prisma.slPlayer.deleteMany()
  console.log('Cleared existing SmashLab data')

  // Seed players
  const playerMap = new Map<string, string>()
  for (const player of players) {
    const created = await prisma.slPlayer.create({
      data: {
        name: player.name,
        slug: player.slug,
        country: player.country,
        birthDate: player.birthDate ? new Date(player.birthDate) : null,
        height: player.height || null,
        playStyle: player.playStyle || null,
        category: player.category,
        bwfId: player.bwfId || null,
        imageUrl: player.imageUrl || null,
        worldRanking: player.worldRanking || null,
        bio: player.bio || null,
      },
    })
    playerMap.set(player.slug, created.id)
    console.log(`  Player: ${player.name} (${player.country})`)
  }
  console.log(`Seeded ${players.length} players`)

  // Seed tournaments
  const tournamentMap = new Map<string, string>()
  for (const tournament of tournaments) {
    const created = await prisma.slTournament.create({
      data: {
        name: tournament.name,
        slug: tournament.slug,
        level: tournament.level,
        location: tournament.location || null,
        country: tournament.country || null,
        startDate: new Date(tournament.startDate),
        endDate: tournament.endDate ? new Date(tournament.endDate) : null,
        year: tournament.year,
      },
    })
    tournamentMap.set(tournament.slug, created.id)
    console.log(`  Tournament: ${tournament.name}`)
  }
  console.log(`Seeded ${tournaments.length} tournaments`)

  // Seed matches
  let matchCount = 0
  for (const match of matches) {
    const tournamentId = tournamentMap.get(match.tournament)
    const player1Id = playerMap.get(match.player1)
    const player2Id = playerMap.get(match.player2)
    const winnerId = match.winner ? playerMap.get(match.winner) : null

    if (!tournamentId || !player1Id || !player2Id) {
      console.warn(`  Skipping match: missing reference (tournament=${match.tournament}, p1=${match.player1}, p2=${match.player2})`)
      continue
    }

    await prisma.slMatch.create({
      data: {
        tournamentId,
        round: match.round,
        date: new Date(match.date),
        category: match.category,
        player1Id,
        player2Id,
        player1Partner: (match as Record<string, unknown>).player1Partner as string | undefined || null,
        player2Partner: (match as Record<string, unknown>).player2Partner as string | undefined || null,
        score: match.score,
        winnerId: winnerId || null,
        walkover: false,
        durationMin: (match as Record<string, unknown>).durationMin as number | undefined || null,
      },
    })
    matchCount++
  }
  console.log(`Seeded ${matchCount} matches`)

  console.log('SmashLab seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
