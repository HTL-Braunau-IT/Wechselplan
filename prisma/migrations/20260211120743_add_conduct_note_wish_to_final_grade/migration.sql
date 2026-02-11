-- DropForeignKey
ALTER TABLE "FinalGrade" DROP CONSTRAINT "FinalGrade_schoolYearId_fkey";

-- DropForeignKey
ALTER TABLE "Grade" DROP CONSTRAINT "Grade_schoolYearId_fkey";

-- DropForeignKey
ALTER TABLE "NotenmanagementTransfer" DROP CONSTRAINT "NotenmanagementTransfer_schoolYearId_fkey";

-- DropForeignKey
ALTER TABLE "Schedule" DROP CONSTRAINT "Schedule_schoolYearId_fkey";

-- DropForeignKey
ALTER TABLE "TeacherAssignment" DROP CONSTRAINT "TeacherAssignment_schoolYearId_fkey";

-- AlterTable
ALTER TABLE "FinalGrade" ADD COLUMN     "conductNoteWish" TEXT;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalGrade" ADD CONSTRAINT "FinalGrade_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotenmanagementTransfer" ADD CONSTRAINT "NotenmanagementTransfer_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
