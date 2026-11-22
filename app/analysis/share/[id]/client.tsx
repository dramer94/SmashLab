"use client"

import { useMemo } from "react"
import { CourtMap, PlayersTable, RallyList, ShotTypeChart, SummaryTiles } from "@/components/analysis/results-panels"
import { buildResult } from "@/lib/analysis/engine"
import type { Session } from "@/lib/analysis/types"

export function SharedResults({ session }: { session: Session }) {
  const result = useMemo(() => buildResult(session), [session])
  const noop = () => {}
  return (
    <div className="space-y-6">
      <SummaryTiles result={result} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <PlayersTable result={result} session={session} />
          <ShotTypeChart result={result} session={session} />
        </div>
        <CourtMap result={result} session={session} onShot={noop} />
      </div>
      <RallyList result={result} session={session} onRally={noop} onToggleWinner={noop} onShot={noop} readOnly />
    </div>
  )
}
