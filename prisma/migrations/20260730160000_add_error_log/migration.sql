-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'server',
    "level" TEXT NOT NULL DEFAULT 'error',
    "location" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB,
    "path" TEXT,
    "method" TEXT,
    "actorId" INTEGER,
    "actorName" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorLog_lastSeenAt_idx" ON "ErrorLog"("lastSeenAt");

-- CreateIndex
CREATE INDEX "ErrorLog_location_idx" ON "ErrorLog"("location");

-- CreateIndex
CREATE INDEX "ErrorLog_acknowledgedAt_lastSeenAt_idx" ON "ErrorLog"("acknowledgedAt", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ErrorLog_dedupeKey_idx" ON "ErrorLog"("dedupeKey");
