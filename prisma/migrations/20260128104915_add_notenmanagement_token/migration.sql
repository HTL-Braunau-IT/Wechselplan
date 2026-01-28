-- CreateTable
CREATE TABLE "NotenmanagementToken" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotenmanagementToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotenmanagementToken_username_idx" ON "NotenmanagementToken"("username");

-- CreateIndex
CREATE INDEX "NotenmanagementToken_expiresAt_idx" ON "NotenmanagementToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotenmanagementToken_username_key" ON "NotenmanagementToken"("username");
