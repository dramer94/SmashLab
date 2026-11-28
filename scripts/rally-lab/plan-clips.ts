// From coach.json: which 10-second clips to render for each player (up to 3:
// the first moment of each "work on" tip, then a highlight).
// usage: npx tsx plan-clips.ts lab-data/coach.json > lab-data/clips.json
import { readFileSync } from "node:fs"

type Moment = { t: number; label: string; video: string; file: string; focus: string; names: Record<string, string> }
const players = JSON.parse(readFileSync(process.argv[2], "utf8"))
const jobs: object[] = []
for (const p of players) {
  const picks: (Moment & { kind: string; title: string })[] = []
  for (const tip of p.improve) {
    const m = tip.moments.find((x: Moment) => x.file)
    if (m && picks.length < 2) picks.push({ ...m, kind: "improve", title: tip.title })
  }
  const h = p.highlights?.[0]
  if (h) picks.push({ ...h, kind: "highlight", title: "Highlight" })
  picks.forEach((m, k) => {
    const id = `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${k + 1}`
    jobs.push({ id, player: p.name, kind: m.kind, title: m.title, label: m.label, video: m.video, file: m.file, focus: m.focus, names: m.names, from: Math.max(0, m.t - 2), to: m.t + 8 })
  })
}
console.log(JSON.stringify(jobs, null, 1))
