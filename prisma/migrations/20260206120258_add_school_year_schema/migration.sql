-- AlterTable
ALTER TABLE "FinalGrade" ADD COLUMN     "schoolYearId" INTEGER;

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "schoolYearId" INTEGER;

-- AlterTable
ALTER TABLE "NotenmanagementTransfer" ADD COLUMN     "schoolYearId" INTEGER;

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "schoolYearId" INTEGER;

-- AlterTable
ALTER TABLE "TeacherAssignment" ADD COLUMN     "schoolYearId" INTEGER;

-- CreateTable
CREATE TABLE "SchoolYear" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "semesterChangeDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassMembership" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolYear_label_key" ON "SchoolYear"("label");

-- CreateIndex
CREATE INDEX "SchoolYear_label_idx" ON "SchoolYear"("label");

-- CreateIndex
CREATE INDEX "ClassMembership_studentId_idx" ON "ClassMembership"("studentId");

-- CreateIndex
CREATE INDEX "ClassMembership_classId_idx" ON "ClassMembership"("classId");

-- CreateIndex
CREATE INDEX "ClassMembership_schoolYearId_idx" ON "ClassMembership"("schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassMembership_studentId_schoolYearId_key" ON "ClassMembership"("studentId", "schoolYearId");

-- CreateIndex
CREATE INDEX "FinalGrade_schoolYearId_idx" ON "FinalGrade"("schoolYearId");

-- CreateIndex
CREATE INDEX "Grade_schoolYearId_idx" ON "Grade"("schoolYearId");

-- CreateIndex
CREATE INDEX "NotenmanagementTransfer_schoolYearId_idx" ON "NotenmanagementTransfer"("schoolYearId");

-- CreateIndex
CREATE INDEX "Schedule_schoolYearId_idx" ON "Schedule"("schoolYearId");

-- CreateIndex
CREATE INDEX "TeacherAssignment_schoolYearId_idx" ON "TeacherAssignment"("schoolYearId");

-- AddForeignKey
ALTER TABLE "ClassMembership" ADD CONSTRAINT "ClassMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMembership" ADD CONSTRAINT "ClassMembership_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMembership" ADD CONSTRAINT "ClassMembership_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalGrade" ADD CONSTRAINT "FinalGrade_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotenmanagementTransfer" ADD CONSTRAINT "NotenmanagementTransfer_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
