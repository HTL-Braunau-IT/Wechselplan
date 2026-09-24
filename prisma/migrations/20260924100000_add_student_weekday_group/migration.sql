-- Per-weekday group membership (see StudentWeekdayGroup in schema.prisma).
CREATE TABLE "StudentWeekdayGroup" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "selectedWeekday" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentWeekdayGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentWeekdayGroup_student_plan_day_key"
    ON "StudentWeekdayGroup"("studentId", "classId", "schoolYearId", "selectedWeekday");
CREATE INDEX "StudentWeekdayGroup_plan_day_idx"
    ON "StudentWeekdayGroup"("classId", "schoolYearId", "selectedWeekday");
CREATE INDEX "StudentWeekdayGroup_studentId_idx" ON "StudentWeekdayGroup"("studentId");

ALTER TABLE "StudentWeekdayGroup" ADD CONSTRAINT "StudentWeekdayGroup_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: until now groups were class-wide, so every existing weekday plan
-- starts from the class's current grouping. A combined class's roster is the
-- students of its member classes.
INSERT INTO "StudentWeekdayGroup"
    ("studentId", "classId", "schoolYearId", "selectedWeekday", "groupId", "updatedAt")
SELECT DISTINCT st."id", s."classId", s."schoolYearId", s."selectedWeekday", st."groupId", CURRENT_TIMESTAMP
FROM "Schedule" s
JOIN "Class" c ON c."id" = s."classId"
JOIN "Student" st ON st."groupId" IS NOT NULL AND (
    (NOT c."isCombined" AND st."classId" = c."id")
    OR (c."isCombined" AND st."classId" IN (
        SELECT m."memberClassId" FROM "CombinedClassMember" m WHERE m."combinedClassId" = c."id"
    ))
)
ON CONFLICT DO NOTHING;
