-- SmashLab tables (sl_ prefix to coexist with VACA tables)

CREATE TABLE IF NOT EXISTS "sl_player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'MAS',
    "birthDate" TIMESTAMP(3),
    "height" TEXT,
    "playStyle" TEXT,
    "category" TEXT NOT NULL,
    "bwfId" TEXT,
    "imageUrl" TEXT,
    "worldRanking" INTEGER,
    "bio" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sl_player_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sl_player_slug_key" ON "sl_player"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "sl_player_bwfId_key" ON "sl_player"("bwfId");

CREATE TABLE IF NOT EXISTS "sl_tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "location" TEXT,
    "country" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sl_tournament_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sl_tournament_slug_key" ON "sl_tournament"("slug");

CREATE TABLE IF NOT EXISTS "sl_match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "player1Partner" TEXT,
    "player2Partner" TEXT,
    "score" TEXT NOT NULL,
    "winnerId" TEXT,
    "walkover" BOOLEAN NOT NULL DEFAULT false,
    "durationMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sl_match_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sl_match" DROP CONSTRAINT IF EXISTS "sl_match_tournamentId_fkey";
ALTER TABLE "sl_match" ADD CONSTRAINT "sl_match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "sl_tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sl_match" DROP CONSTRAINT IF EXISTS "sl_match_player1Id_fkey";
ALTER TABLE "sl_match" ADD CONSTRAINT "sl_match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "sl_player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sl_match" DROP CONSTRAINT IF EXISTS "sl_match_player2Id_fkey";
ALTER TABLE "sl_match" ADD CONSTRAINT "sl_match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "sl_player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
