-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "digestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_readAt_digestedAt_createdAt_idx" ON "Notification"("readAt", "digestedAt", "createdAt");

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastDigestRunAt" TIMESTAMP(3),
    "lastDigestStatus" TEXT,
    "lastDigestSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);
