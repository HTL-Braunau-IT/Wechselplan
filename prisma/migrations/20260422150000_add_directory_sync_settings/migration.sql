-- CreateTable
CREATE TABLE "DirectorySyncSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "syncedClassGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "syncMode" TEXT NOT NULL DEFAULT 'hybrid',
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorySyncSettings_pkey" PRIMARY KEY ("id")
);
