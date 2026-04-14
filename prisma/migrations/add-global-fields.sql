-- Add externalId to players
ALTER TABLE sl_player ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
ALTER TABLE sl_player ADD COLUMN IF NOT EXISTS match_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS sl_player_country_idx ON sl_player(country);
CREATE INDEX IF NOT EXISTS sl_player_world_ranking_idx ON sl_player("worldRanking");
CREATE INDEX IF NOT EXISTS sl_player_match_count_idx ON sl_player(match_count);

-- Add externalId to tournaments
ALTER TABLE sl_tournament ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
ALTER TABLE sl_tournament ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS sl_tournament_year_idx ON sl_tournament(year);
CREATE INDEX IF NOT EXISTS sl_tournament_level_idx ON sl_tournament(level);
CREATE INDEX IF NOT EXISTS sl_tournament_external_id_idx ON sl_tournament(external_id);

-- Add match indexes
CREATE INDEX IF NOT EXISTS sl_match_p1_date_idx ON sl_match("player1Id", date);
CREATE INDEX IF NOT EXISTS sl_match_p2_date_idx ON sl_match("player2Id", date);
CREATE INDEX IF NOT EXISTS sl_match_tournament_idx ON sl_match("tournamentId");

-- Create sync log table
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
