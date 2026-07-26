-- CreateTable
CREATE TABLE "GamePack" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',

    CONSTRAINT "GamePack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GamePack_slug_key" ON "GamePack"("slug");

-- AlterTable Match: add packId
ALTER TABLE "Match" ADD COLUMN "packId" TEXT;

-- CreateIndex
CREATE INDEX "Match_packId_idx" ON "Match"("packId");

-- AlterTable Question: migrate from match-linked to pack-linked
-- Drop old match FK if present, rebuild columns for pack bank
ALTER TABLE "Question" DROP CONSTRAINT IF EXISTS "Question_matchId_fkey";
ALTER TABLE "Question" DROP COLUMN IF EXISTS "matchId";
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "packId" TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Orphan rows (no pack) cannot satisfy NOT NULL — clear empty legacy bank
DELETE FROM "Question" WHERE "packId" IS NULL;

ALTER TABLE "Question" ALTER COLUMN "packId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Question_packId_sortOrder_idx" ON "Question"("packId", "sortOrder");

ALTER TABLE "Question" ADD CONSTRAINT "Question_packId_fkey"
  FOREIGN KEY ("packId") REFERENCES "GamePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Match" ADD CONSTRAINT "Match_packId_fkey"
  FOREIGN KEY ("packId") REFERENCES "GamePack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
