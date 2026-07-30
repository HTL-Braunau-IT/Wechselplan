-- AlterTable: link identifiers cached on Student (Sokrates id from Entra, NM identity from link sync)
ALTER TABLE "Student" ADD COLUMN     "matrikelnummer" TEXT,
ADD COLUMN     "nmKlasse" TEXT,
ADD COLUMN     "nmLinkedAt" TIMESTAMP(3),
ADD COLUMN     "sokratesId" TEXT;

-- CreateTable
CREATE TABLE "NotenmanagementSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "serviceUsername" TEXT,
    "servicePasswordEnc" TEXT,
    "lastLinkSyncAt" TIMESTAMP(3),
    "lastLinkSyncStatus" TEXT,
    "lastLinkSyncSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotenmanagementSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_sokratesId_key" ON "Student"("sokratesId");

-- CreateIndex
CREATE INDEX "Student_matrikelnummer_idx" ON "Student"("matrikelnummer");

