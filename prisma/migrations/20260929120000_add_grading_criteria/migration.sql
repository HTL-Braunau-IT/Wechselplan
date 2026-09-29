-- CreateTable
CREATE TABLE "GradingCriteria" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "content" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingCriteriaClass" (
    "id" SERIAL NOT NULL,
    "criteriaId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,

    CONSTRAINT "GradingCriteriaClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradingCriteria_shareToken_key" ON "GradingCriteria"("shareToken");

-- CreateIndex
CREATE INDEX "GradingCriteria_teacherId_idx" ON "GradingCriteria"("teacherId");

-- CreateIndex
CREATE INDEX "GradingCriteriaClass_criteriaId_idx" ON "GradingCriteriaClass"("criteriaId");

-- CreateIndex
CREATE INDEX "GradingCriteriaClass_classId_idx" ON "GradingCriteriaClass"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "GradingCriteriaClass_teacherId_classId_key" ON "GradingCriteriaClass"("teacherId", "classId");

-- AddForeignKey
ALTER TABLE "GradingCriteria" ADD CONSTRAINT "GradingCriteria_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingCriteriaClass" ADD CONSTRAINT "GradingCriteriaClass_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "GradingCriteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingCriteriaClass" ADD CONSTRAINT "GradingCriteriaClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

