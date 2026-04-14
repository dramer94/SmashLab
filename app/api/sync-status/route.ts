import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  // Try to get sync log — table may not exist yet
  try {
    const latest = await prisma.slSyncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    })
    const stats = await prisma.slPlayer.count({ where: { isActive: true } })
    const matches = await prisma.slMatch.count()
    const tournaments = await prisma.slTournament.count()

    return NextResponse.json({
      lastSync: latest?.completedAt ?? null,
      status: latest?.status ?? 'never',
      stats: { players: stats, matches, tournaments },
      lastSyncStats: latest ? {
        tournamentsScraped: latest.tournamentsTotal,
        matchesAdded: latest.matchesAdded,
        yearsRange: latest.yearsRange,
      } : null,
    })
  } catch {
    return NextResponse.json({ lastSync: null, status: 'unknown', stats: {} })
  }
}
