-- CreateTable
CREATE TABLE "JahresstoffPerClass" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "jahresstoff" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JahresstoffPerClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JahresstoffPerClass_teacherId_idx" ON "JahresstoffPerClass"("teacherId");

-- CreateIndex
CREATE INDEX "JahresstoffPerClass_classId_idx" ON "JahresstoffPerClass"("classId");

-- CreateIndex
CREATE INDEX "JahresstoffPerClass_schoolYearId_idx" ON "JahresstoffPerClass"("schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "JahresstoffPerClass_teacherId_classId_schoolYearId_key" ON "JahresstoffPerClass"("teacherId", "classId", "schoolYearId");
