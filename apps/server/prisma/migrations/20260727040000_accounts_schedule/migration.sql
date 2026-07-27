-- AlterTable User: account fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isCommissioner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isReader" BOOLEAN NOT NULL DEFAULT false;

-- Existing users without password cannot login; set placeholder (commissioner seed overwrites)
UPDATE "User" SET "passwordHash" = '!' WHERE "passwordHash" IS NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;

-- AlterTable Registration: rosterText default
ALTER TABLE "Registration" ALTER COLUMN "rosterText" SET DEFAULT '';

-- AlterTable TeamMember: seasonId
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "seasonId" TEXT;

-- CreateTable RosterPlayer
CREATE TABLE IF NOT EXISTS "RosterPlayer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "registrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RosterPlayer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RosterPlayer_registrationId_sortOrder_idx" ON "RosterPlayer"("registrationId", "sortOrder");

ALTER TABLE "RosterPlayer" DROP CONSTRAINT IF EXISTS "RosterPlayer_registrationId_fkey";
ALTER TABLE "RosterPlayer" ADD CONSTRAINT "RosterPlayer_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RosterPlayer" DROP CONSTRAINT IF EXISTS "RosterPlayer_userId_fkey";
ALTER TABLE "RosterPlayer" ADD CONSTRAINT "RosterPlayer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable SeasonWeek
CREATE TABLE IF NOT EXISTS "SeasonWeek" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "seasonId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    CONSTRAINT "SeasonWeek_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeasonWeek_seasonId_weekIndex_key" ON "SeasonWeek"("seasonId", "weekIndex");
CREATE INDEX IF NOT EXISTS "SeasonWeek_seasonId_idx" ON "SeasonWeek"("seasonId");

ALTER TABLE "SeasonWeek" DROP CONSTRAINT IF EXISTS "SeasonWeek_seasonId_fkey";
ALTER TABLE "SeasonWeek" ADD CONSTRAINT "SeasonWeek_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable ScheduledMatch
CREATE TABLE IF NOT EXISTS "ScheduledMatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "seasonId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "teamAId" TEXT NOT NULL,
    "teamBId" TEXT NOT NULL,
    "readerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "startsAt" TIMESTAMP(3),
    "notes" TEXT,
    "liveMatchId" TEXT,
    CONSTRAINT "ScheduledMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledMatch_liveMatchId_key" ON "ScheduledMatch"("liveMatchId");
CREATE INDEX IF NOT EXISTS "ScheduledMatch_weekId_idx" ON "ScheduledMatch"("weekId");
CREATE INDEX IF NOT EXISTS "ScheduledMatch_seasonId_idx" ON "ScheduledMatch"("seasonId");
CREATE INDEX IF NOT EXISTS "ScheduledMatch_readerId_idx" ON "ScheduledMatch"("readerId");

ALTER TABLE "ScheduledMatch" DROP CONSTRAINT IF EXISTS "ScheduledMatch_seasonId_fkey";
ALTER TABLE "ScheduledMatch" ADD CONSTRAINT "ScheduledMatch_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduledMatch" DROP CONSTRAINT IF EXISTS "ScheduledMatch_weekId_fkey";
ALTER TABLE "ScheduledMatch" ADD CONSTRAINT "ScheduledMatch_weekId_fkey"
  FOREIGN KEY ("weekId") REFERENCES "SeasonWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduledMatch" DROP CONSTRAINT IF EXISTS "ScheduledMatch_teamAId_fkey";
ALTER TABLE "ScheduledMatch" ADD CONSTRAINT "ScheduledMatch_teamAId_fkey"
  FOREIGN KEY ("teamAId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScheduledMatch" DROP CONSTRAINT IF EXISTS "ScheduledMatch_teamBId_fkey";
ALTER TABLE "ScheduledMatch" ADD CONSTRAINT "ScheduledMatch_teamBId_fkey"
  FOREIGN KEY ("teamBId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScheduledMatch" DROP CONSTRAINT IF EXISTS "ScheduledMatch_readerId_fkey";
ALTER TABLE "ScheduledMatch" ADD CONSTRAINT "ScheduledMatch_readerId_fkey"
  FOREIGN KEY ("readerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "TeamMember_teamId_idx" ON "TeamMember"("teamId");
