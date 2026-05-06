-- AlterTable: Class
ALTER TABLE "Class" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Class" ADD COLUMN "externalSource" TEXT;
ALTER TABLE "Class" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Class" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Class" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- Backfill: make explicit intent even though DEFAULT already handled new rows
UPDATE "Class" SET "isActive" = true WHERE "isActive" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Class_externalId_key" ON "Class"("externalId");

-- CreateIndex
CREATE INDEX "Class_isActive_idx" ON "Class"("isActive");

-- AlterTable: Student
ALTER TABLE "Student" ADD COLUMN "email" TEXT;
ALTER TABLE "Student" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Student" ADD COLUMN "externalSource" TEXT;
ALTER TABLE "Student" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Student" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN "syncStatus" TEXT;

-- Backfill: make explicit intent even though DEFAULT already handled new rows
UPDATE "Student" SET "isActive" = true WHERE "isActive" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Student_externalId_key" ON "Student"("externalId");

-- CreateIndex
CREATE INDEX "Student_isActive_idx" ON "Student"("isActive");
