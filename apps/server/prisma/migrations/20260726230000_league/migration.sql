-- AlterTable
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Season" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "entryFeeCents" INTEGER NOT NULL DEFAULT 0,
    "entryNote" TEXT,
    "blurb" TEXT,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Registration" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "captainName" TEXT NOT NULL,
    "captainEmail" TEXT NOT NULL,
    "captainPhone" TEXT,
    "rosterText" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "pointsFor" INTEGER NOT NULL DEFAULT 0,
    "pointsAgainst" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "seasonId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Season_slug_key" ON "Season"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Registration_seasonId_idx" ON "Registration"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Registration_seasonId_teamId_key" ON "Registration"("seasonId", "teamId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Registration" ADD CONSTRAINT "Registration_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Registration" ADD CONSTRAINT "Registration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
