-- CreateTable
CREATE TABLE "NotenmanagementTransfer" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "semester" TEXT NOT NULL,
    "lfId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotenmanagementTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotenmanagementTransfer_classId_idx" ON "NotenmanagementTransfer"("classId");

-- CreateIndex
CREATE INDEX "NotenmanagementTransfer_semester_idx" ON "NotenmanagementTransfer"("semester");

-- CreateIndex
CREATE UNIQUE INDEX "NotenmanagementTransfer_classId_semester_key" ON "NotenmanagementTransfer"("classId", "semester");

-- AddForeignKey
ALTER TABLE "NotenmanagementTransfer" ADD CONSTRAINT "NotenmanagementTransfer_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
