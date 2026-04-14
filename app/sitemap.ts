import { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://smashlab.vacabc.my"

  const players = await prisma.slPlayer.findMany({ select: { slug: true, updatedAt: true } })
  const tournaments = await prisma.slTournament.findMany({ select: { slug: true, createdAt: true } })

  const playerUrls = players.map((p) => ({
    url: `${baseUrl}/players/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }))

  const tournamentUrls = tournaments.map((t) => ({
    url: `${baseUrl}/tournaments/${t.slug}`,
    lastModified: t.createdAt,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }))

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/players`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/head-to-head`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/compare`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/tournaments`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    ...playerUrls,
    ...tournamentUrls,
  ]
}
