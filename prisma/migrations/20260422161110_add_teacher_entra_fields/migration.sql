-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "externalSource" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Teacher" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Teacher" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- Backfill: make explicit intent even though DEFAULT already handled new rows
UPDATE "Teacher" SET "isActive" = true WHERE "isActive" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_externalId_key" ON "Teacher"("externalId");

-- CreateIndex
CREATE INDEX "Teacher_isActive_idx" ON "Teacher"("isActive");
