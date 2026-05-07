-- Phase 2b: Convert TeacherRotation.turnId from String (turn name) to Int FK -> ScheduleTurn.id.
-- Backfill resolves each rotation row to the matching ScheduleTurn within the
-- correct (classId, schoolYearId, selectedWeekday) Schedule.

-- 1) Add new int column (nullable for backfill).
ALTER TABLE "TeacherRotation" ADD COLUMN "turnId_new" INTEGER;

-- 2) Backfill: join via Schedule, then ScheduleTurn by name.
UPDATE "TeacherRotation" tr
SET "turnId_new" = st."id"
FROM "Schedule" s
JOIN "ScheduleTurn" st ON st."scheduleId" = s."id"
WHERE s."classId" = tr."classId"
  AND s."schoolYearId" = tr."schoolYearId"
  AND s."selectedWeekday" = tr."selectedWeekday"
  AND st."name" = tr."turnId";

-- 3) Drop legacy unique index and the old string column.
DROP INDEX IF EXISTS "TeacherRotation_classId_groupId_turnId_period_schoolYearId_select_key";

DELETE FROM "TeacherRotation" WHERE "turnId_new" IS NULL;

ALTER TABLE "TeacherRotation" DROP COLUMN "turnId";
ALTER TABLE "TeacherRotation" RENAME COLUMN "turnId_new" TO "turnId";
ALTER TABLE "TeacherRotation" ALTER COLUMN "turnId" SET NOT NULL;

-- 4) Re-create the composite unique on the new int column and add the FK.
CREATE UNIQUE INDEX "TeacherRotation_classId_groupId_turnId_period_schoolYearId_select_key"
  ON "TeacherRotation" ("classId", "groupId", "turnId", "period", "schoolYearId", "selectedWeekday");

CREATE INDEX "TeacherRotation_turnId_idx" ON "TeacherRotation" ("turnId");

ALTER TABLE "TeacherRotation"
  ADD CONSTRAINT "TeacherRotation_turnId_fkey"
    FOREIGN KEY ("turnId") REFERENCES "ScheduleTurn"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
