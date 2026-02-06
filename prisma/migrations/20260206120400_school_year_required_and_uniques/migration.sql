-- Make schoolYearId required on all tables that reference SchoolYear
ALTER TABLE "Schedule" ALTER COLUMN "schoolYearId" SET NOT NULL;
ALTER TABLE "TeacherAssignment" ALTER COLUMN "schoolYearId" SET NOT NULL;
ALTER TABLE "Grade" ALTER COLUMN "schoolYearId" SET NOT NULL;
ALTER TABLE "FinalGrade" ALTER COLUMN "schoolYearId" SET NOT NULL;
ALTER TABLE "NotenmanagementTransfer" ALTER COLUMN "schoolYearId" SET NOT NULL;

-- Drop old unique constraints and add new ones including schoolYearId
DROP INDEX IF EXISTS "TeacherAssignment_classId_period_groupId_key";
CREATE UNIQUE INDEX "TeacherAssignment_classId_period_groupId_schoolYearId_key" ON "TeacherAssignment"("classId", "period", "groupId", "schoolYearId");

DROP INDEX IF EXISTS "Grade_studentId_teacherId_classId_semester_key";
CREATE UNIQUE INDEX "Grade_studentId_teacherId_classId_semester_schoolYearId_key" ON "Grade"("studentId", "teacherId", "classId", "semester", "schoolYearId");

DROP INDEX IF EXISTS "FinalGrade_studentId_classId_semester_key";
CREATE UNIQUE INDEX "FinalGrade_studentId_classId_semester_schoolYearId_key" ON "FinalGrade"("studentId", "classId", "semester", "schoolYearId");

DROP INDEX IF EXISTS "NotenmanagementTransfer_classId_semester_key";
CREATE UNIQUE INDEX "NotenmanagementTransfer_classId_semester_schoolYearId_key" ON "NotenmanagementTransfer"("classId", "semester", "schoolYearId");
