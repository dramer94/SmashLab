# SmashLab Sync Handoff for Codex

## What's happening

A full historical sync is running on the VPS under `nohup`. It scrapes badmintonstatistics.net for all tournament/match/player data from 1990–2026.

- **VPS:** `ssh -i ~/.ssh/id_ed25519 root@5.223.72.252`
- **Process:** PID may change if VPS reboots; check with `ps axo pid,etime,cmd | grep sync-global | grep -v grep`
- **Log:** `/tmp/sync-full2.log`
- **Progress:** ~531/4099 tournaments as of 2026-04-17. Rate: ~53/hour. ETA: 2–3 more days.
- **No intervention needed** while it runs.

## How to check if sync finished

```bash
ssh -i ~/.ssh/id_ed25519 root@5.223.72.252
# If no process shows up, sync is done:
ps axo pid,etime,cmd | grep sync-global | grep -v grep
# Confirm in log:
tail -5 /tmp/sync-full2.log
# Should show "─── Sync Complete ───"
```

## Post-sync commands (run IN ORDER once sync is done)

All commands run on VPS inside `/var/www/smashlab`:

### Step 1: Update match counts (REQUIRED)
```bash
cd /var/www/smashlab
node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  await p.\$executeRawUnsafe('UPDATE sl_player SET \"matchCount\" = (SELECT COUNT(*) FROM sl_match m WHERE m.\"player1Id\" = sl_player.id OR m.\"player2Id\" = sl_player.id)');
  await p.\$executeRawUnsafe('UPDATE sl_player SET \"isActive\" = true WHERE \"matchCount\" >= 5');
  await p.\$executeRawUnsafe('UPDATE sl_player SET \"isActive\" = false WHERE \"matchCount\" < 5');
  console.log('Match counts updated');
  process.exit(0);
})();
"
```

### Step 2: Re-scrape priority ranking snapshots
```bash
npx tsx scripts/scrape-rankings.ts --priority
```
This fetches BWF ranking snapshots for the week before each Thomas/Uber/Sudirman edition. ~270 HTTP requests, ~2 minutes. Idempotent.

### Step 3: Recompute team scores + squads
```bash
npx tsx scripts/compute-team-scores.ts
```
Recomputes strength scores and squad breakdowns for all 54 editions using the now-complete match data. Also fills in `bwfRank` from ranking snapshots.

### Step 4: Rebuild + restart the app
```bash
npm run build && pm2 restart smashlab
```

### Step 5: Verify
```bash
curl -s https://smashlab.vacabc.my/team-cups?type=THOMAS\&year=2024 | grep -c "BWF rank"
# Should output a number > 0
```

## CRITICAL: Do NOT run `prisma db push`

SmashLab and badminton-league share the SAME Neon Postgres database. Running `prisma db push` from either app will prompt to DROP the other app's tables. Always use raw SQL for schema changes:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const c=new(PrismaClient)();c.\$executeRawUnsafe('CREATE TABLE IF NOT EXISTS ...').then(()=>process.exit(0))"
```

## DB capacity

- Neon limit: 512 MB
- Current usage: ~80 MB
- Expected after full sync: ~300–350 MB (fits)
- If it hits the limit, the sync log will show `project size limit (512 MB) has been exceeded`. In that case, trim ranking snapshots: `DELETE FROM sl_ranking_snapshot WHERE rank > 30`

## Key files

| File | Purpose |
|---|---|
| `scripts/sync-global.ts` | Main tournament/match/player scraper |
| `scripts/scrape-rankings.ts` | BWF ranking snapshot scraper |
| `scripts/compute-team-scores.ts` | Computes squad + scores for team cups |
| `scripts/seed-team-events.ts` | Seeds Thomas/Uber/Sudirman finishes from JSON |
| `scripts/data/team-cup-history.json` | Hand-entered historical finishes |
| `app/team-cups/page.tsx` | The Team Cups page |
| `prisma/schema.prisma` | DB schema (DO NOT use `prisma db push`) |
