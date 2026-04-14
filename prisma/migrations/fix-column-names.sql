-- Drop snake_case columns added by mistake and add proper camelCase columns
-- (Prisma uses quoted camelCase column names without @map)

-- Fix sl_player columns
ALTER TABLE sl_player DROP COLUMN IF EXISTS external_id;
ALTER TABLE sl_player DROP COLUMN IF EXISTS match_count;
ALTER TABLE sl_player ADD COLUMN IF NOT EXISTS "externalId" TEXT UNIQUE;
ALTER TABLE sl_player ADD COLUMN IF NOT EXISTS "matchCount" INTEGER NOT NULL DEFAULT 0;

-- Fix sl_tournament columns
ALTER TABLE sl_tournament DROP COLUMN IF EXISTS external_id;
ALTER TABLE sl_tournament DROP COLUMN IF EXISTS last_scraped_at;
ALTER TABLE sl_tournament ADD COLUMN IF NOT EXISTS "externalId" TEXT UNIQUE;
ALTER TABLE sl_tournament ADD COLUMN IF NOT EXISTS "lastScrapedAt" TIMESTAMP WITH TIME ZONE;

-- Recreate indexes with correct column names
DROP INDEX IF EXISTS sl_player_world_ranking_idx;
DROP INDEX IF EXISTS sl_player_match_count_idx;
DROP INDEX IF EXISTS sl_tournament_external_id_idx;
DROP INDEX IF EXISTS sl_match_p1_date_idx;
DROP INDEX IF EXISTS sl_match_p2_date_idx;
DROP INDEX IF EXISTS sl_match_tournament_idx;

CREATE INDEX IF NOT EXISTS sl_player_world_ranking_idx ON sl_player("worldRanking");
CREATE INDEX IF NOT EXISTS sl_player_match_count_idx ON sl_player("matchCount");
CREATE INDEX IF NOT EXISTS sl_tournament_external_id_idx ON sl_tournament("externalId");
CREATE INDEX IF NOT EXISTS sl_match_p1_date_idx ON sl_match("player1Id", date);
CREATE INDEX IF NOT EXISTS sl_match_p2_date_idx ON sl_match("player2Id", date);
CREATE INDEX IF NOT EXISTS sl_match_tournament_idx ON sl_match("tournamentId");

-- Drop and recreate sl_sync_log with correct column names
DROP TABLE IF EXISTS sl_sync_log;
CREATE TABLE IF NOT EXISTS sl_sync_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMP WITH TIME ZONE,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  "yearsRange" TEXT,
  "tournamentsTotal" INTEGER NOT NULL DEFAULT 0,
  "tournamentsNew" INTEGER NOT NULL DEFAULT 0,
  "matchesAdded" INTEGER NOT NULL DEFAULT 0,
  "playersDiscovered" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT
);
