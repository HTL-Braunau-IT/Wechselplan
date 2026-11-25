-- Teachers can differ between the two semesters of one weekday plan.
-- "full" = the row applies all year (every existing row); a plan whose second
-- semester is planned separately holds "first" + "second" rows instead.
ALTER TABLE "TeacherAssignment" ADD COLUMN "semester" TEXT NOT NULL DEFAULT 'full';

DROP INDEX "TeacherAssignment_classId_period_groupId_schoolYearId_selec_key";
CREATE UNIQUE INDEX "TeacherAssignment_classId_period_groupId_schoolYearId_selec_key" ON "TeacherAssignment"("classId", "period", "groupId", "schoolYearId", "selectedWeekday", "semester");

ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_semester_check" CHECK ("semester" IN ('full', 'first', 'second'));
