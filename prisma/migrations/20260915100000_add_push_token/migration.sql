-- CreateTable
CREATE TABLE "PushToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_teacherId_idx" ON "PushToken"("teacherId");

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
