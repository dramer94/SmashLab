-- SmashLab accounts, saved Rally Analysis stats and share links.
--
-- Adds four NEW tables (sl_user, sl_auth_session, sl_play_stat,
-- sl_shared_analysis). It does not change or drop anything that exists, and
-- does not touch badminton-league's tables. Safe to run more than once.
--
-- Run on the VPS (inside /var/www/smashlab), NOT `prisma db push`:
--   npx prisma db execute --file prisma/migrations/add-accounts.sql --schema prisma/schema.prisma
--
-- Generated with `prisma migrate diff` from the previous schema, then made idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "sl_user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sl_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sl_auth_session" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sl_auth_session_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sl_play_stat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "videoName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "playerName" TEXT NOT NULL,
    "durationS" DOUBLE PRECISION NOT NULL,
    "rallies" INTEGER NOT NULL,
    "pointsWon" INTEGER NOT NULL,
    "pointsLost" INTEGER NOT NULL,
    "shots" INTEGER NOT NULL,
    "smashes" INTEGER NOT NULL,
    "fastestKmh" INTEGER,
    "avgSmashKmh" INTEGER,
    "distanceM" DOUBLE PRECISION NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "topSpeedMs" DOUBLE PRECISION NOT NULL,
    "shotTypes" JSONB NOT NULL,

    CONSTRAINT "sl_play_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sl_shared_analysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sl_shared_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sl_user_email_key" ON "sl_user"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sl_auth_session_userId_idx" ON "sl_auth_session"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sl_play_stat_createdAt_idx" ON "sl_play_stat"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sl_play_stat_userId_analysisId_key" ON "sl_play_stat"("userId", "analysisId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sl_shared_analysis_userId_idx" ON "sl_shared_analysis"("userId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sl_auth_session_userId_fkey') THEN
    ALTER TABLE "sl_auth_session" ADD CONSTRAINT "sl_auth_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "sl_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sl_play_stat_userId_fkey') THEN
    ALTER TABLE "sl_play_stat" ADD CONSTRAINT "sl_play_stat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "sl_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sl_shared_analysis_userId_fkey') THEN
    ALTER TABLE "sl_shared_analysis" ADD CONSTRAINT "sl_shared_analysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "sl_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

