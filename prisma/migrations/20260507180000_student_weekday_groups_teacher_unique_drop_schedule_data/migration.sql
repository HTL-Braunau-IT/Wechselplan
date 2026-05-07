-- CreateTable
CREATE TABLE "StudentWeekdayGroup" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentWeekdayGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentWeekdayGroup_studentId_schoolYearId_weekday_key" ON "StudentWeekdayGroup"("studentId", "schoolYearId", "weekday");

CREATE INDEX "StudentWeekdayGroup_studentId_idx" ON "StudentWeekdayGroup"("studentId");

CREATE INDEX "StudentWeekdayGroup_schoolYearId_idx" ON "StudentWeekdayGroup"("schoolYearId");

ALTER TABLE "StudentWeekdayGroup" ADD CONSTRAINT "StudentWeekdayGroup_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentWeekdayGroup" ADD CONSTRAINT "StudentWeekdayGroup_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill per-weekday groups from current Student.groupId for each class membership / school year.
INSERT INTO "StudentWeekdayGroup" ("studentId", "schoolYearId", "weekday", "groupId", "createdAt", "updatedAt")
SELECT m."studentId", m."schoolYearId", w.d, s."groupId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ClassMembership" m
INNER JOIN "Student" s ON s.id = m."studentId"
CROSS JOIN generate_series(1, 5) AS w(d)
WHERE s."groupId" IS NOT NULL;

-- TeacherAssignment: allow distinct rows per weekday
DROP INDEX IF EXISTS "TeacherAssignment_classId_period_groupId_schoolYearId_key";

CREATE UNIQUE INDEX "TeacherAssignment_classId_period_groupId_schoolYearId_selectedWeekday_key" ON "TeacherAssignment"("classId", "period", "groupId", "schoolYearId", "selectedWeekday");

-- Rotation JSON blob replaced by normalized turns
ALTER TABLE "Schedule" DROP COLUMN IF EXISTS "scheduleData";
