# Rally Analysis: deploy notes

`/analysis` runs entirely in the browser (videos never leave the device). Accounts,
saved profile stats, share links and the leaderboard need four new database tables.

## One-time database step (before deploying this code)

Run on the VPS inside `/var/www/smashlab`, after pulling the code:

```bash
npx prisma db execute --file prisma/migrations/add-accounts.sql --schema prisma/schema.prisma
```

- Creates only NEW tables: `sl_user`, `sl_auth_session`, `sl_play_stat`, `sl_shared_analysis`.
- Changes or drops nothing that exists and does not touch badminton-league's tables.
- Safe to run more than once (`IF NOT EXISTS` everywhere).
- Do NOT use `prisma db push` (it would offer to drop the other app's tables).

Then build and restart as usual (`./deploy.sh update`). If the code is deployed before
the SQL runs, the analysis page still works; only sign-in, saving and sharing fail.

## Storage

| Table | Size per row |
|---|---|
| `sl_play_stat` | under 1 KB (numbers only) |
| `sl_shared_analysis` | typically 15–60 KB, capped at 400 KB |

Shares are limited to 50 per player and 1,000 site-wide (env `SHARE_LIMIT`), roughly
70 MB in the worst case after Postgres compression. To check the size:

```sql
SELECT pg_size_pretty(pg_total_relation_size('sl_shared_analysis'));
```

To free space, delete old, unviewed shares, e.g.
`DELETE FROM sl_shared_analysis WHERE "createdAt" < now() - interval '180 days' AND views < 3;`

## Security

- Passwords: scrypt (random 16-byte salt). Sessions: random 32-byte token in an
  HttpOnly, SameSite=Lax cookie (Secure in production); only its SHA-256 is stored.
- JSON-only, same-origin POSTs (blocks cross-site form posts); sign-in/sign-up are
  rate limited per IP and per email (in memory, per process).
- Deleting an account deletes its stats and share links (foreign keys cascade).
