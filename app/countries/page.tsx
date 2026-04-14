import { Metadata } from "next"
import Link from "next/link"
import { getCountrySummaries } from "@/lib/queries"

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Countries",
  description: "Browse badminton players by country. See how many active players each nation has on the international circuit.",
}

export default async function CountriesPage() {
  const countries = await getCountrySummaries()
  const filtered = countries.filter((c) => c.country !== 'UNK' && c.count >= 1)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Countries</h1>
        <p className="text-gray-400 mt-1">
          {filtered.length} countries represented on the international badminton circuit
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((c) => (
          <Link
            key={c.country}
            href={`/players?country=${c.country}`}
            className="bg-[var(--card)] border border-white/10 rounded-xl p-4 hover:border-blue-500/50 hover:bg-white/5 transition-colors flex items-center gap-4"
          >
            <span className="text-3xl">{c.flag}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white">{c.country}</div>
              <div className="text-sm text-gray-400">
                {c.count} active player{c.count !== 1 ? 's' : ''}
              </div>
              {c.topPlayer && (
                <div className="text-xs text-gray-500 truncate mt-0.5">{c.topPlayer}</div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-blue-400 font-bold text-lg">{c.count}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
