-- CreateTable
CREATE TABLE "Absence" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER,
    "studentName" TEXT NOT NULL,
    "classId" INTEGER NOT NULL,
    "groupId" INTEGER,
    "date" DATE NOT NULL,
    "startTime" INTEGER NOT NULL,
    "endTime" INTEGER NOT NULL,
    "reason" TEXT,
    "reasonId" INTEGER,
    "excuseStatus" TEXT NOT NULL,
    "text" TEXT,
    "untisId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Absence_studentId_idx" ON "Absence"("studentId");

-- CreateIndex
CREATE INDEX "Absence_classId_idx" ON "Absence"("classId");

-- CreateIndex
CREATE INDEX "Absence_groupId_idx" ON "Absence"("groupId");

-- CreateIndex
CREATE INDEX "Absence_date_idx" ON "Absence"("date");

-- CreateIndex
CREATE INDEX "Absence_untisId_idx" ON "Absence"("untisId");
