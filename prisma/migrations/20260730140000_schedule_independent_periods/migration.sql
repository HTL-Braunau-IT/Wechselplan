-- Schedule: AM and PM become independent lanes.
--   * per-period enable flags + cadence (weekInterval/weekOffset)
--   * ScheduleTurn gains a `period` so each lane owns its own Turnusse
--   * TeacherAssignment / TeacherRotation become weekday-scoped (a class can now
--     hold a different plan on each weekday) — fixes the old cross-weekday overwrite.
-- NOTE: this migration deliberately does NOT touch the pre-existing `Absence`
-- table drift (a model dropped from schema.prisma without a drop migration).

-- DropIndex (old, narrower unique keys — replaced below after the backfill)
DROP INDEX "ScheduleTurn_scheduleId_order_key";
DROP INDEX "TeacherAssignment_classId_period_groupId_schoolYearId_key";
DROP INDEX "TeacherRotation_classId_groupId_turnId_period_key";

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "amEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "amWeekInterval" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "amWeekOffset" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pmEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pmWeekInterval" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pmWeekOffset" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ScheduleTurn" ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'AM';

-- AlterTable
ALTER TABLE "TeacherRotation" ADD COLUMN     "schoolYearId" INTEGER,
ADD COLUMN     "selectedWeekday" INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- Data backfill: preserve existing plans under the new per-period model.
-- Pre-migration, AM and PM shared one Turnus set and assignments were not
-- weekday-scoped, so match a period's existence on class + year + period only.
-- ---------------------------------------------------------------------------

-- 1. Set the per-period enable flags from the teacher assignments that exist.
UPDATE "Schedule" s SET
  "amEnabled" = EXISTS (
    SELECT 1 FROM "TeacherAssignment" ta
    WHERE ta."classId" = s."classId" AND ta."schoolYearId" = s."schoolYearId" AND ta."period" = 'AM'
  ),
  "pmEnabled" = EXISTS (
    SELECT 1 FROM "TeacherAssignment" ta
    WHERE ta."classId" = s."classId" AND ta."schoolYearId" = s."schoolYearId" AND ta."period" = 'PM'
  );

-- 1b. Never leave a plan with both lanes off (e.g. a draft with no assignments,
--     or assignments scoped to another year): fall back to the legacy AM lane.
UPDATE "Schedule" SET "amEnabled" = true WHERE "amEnabled" = false AND "pmEnabled" = false;

-- 2. PM-only plans: the shared Turnusse are tagged 'AM' by the column default;
--    re-tag them to 'PM' so the (only) active lane owns them.
UPDATE "ScheduleTurn" t SET "period" = 'PM'
FROM "Schedule" s
WHERE s.id = t."scheduleId" AND s."amEnabled" = false AND s."pmEnabled" = true AND t."period" = 'AM';

-- 3. AM+PM plans: duplicate the shared AM Turnusse (with their weeks + holidays)
--    into an identical PM lane.
CREATE TEMP TABLE _pm_turn_map (old_turn_id INTEGER, new_turn_id INTEGER) ON COMMIT DROP;

WITH ins AS (
  INSERT INTO "ScheduleTurn" ("scheduleId", "period", "name", "customLength", "order", "createdAt", "updatedAt")
  SELECT t."scheduleId", 'PM', t."name", t."customLength", t."order", NOW(), NOW()
  FROM "ScheduleTurn" t
  JOIN "Schedule" s ON s.id = t."scheduleId"
  WHERE t."period" = 'AM' AND s."amEnabled" = true AND s."pmEnabled" = true
  RETURNING id, "scheduleId", "order"
)
INSERT INTO _pm_turn_map (old_turn_id, new_turn_id)
SELECT amt.id, ins.id
FROM ins
JOIN "ScheduleTurn" amt
  ON amt."scheduleId" = ins."scheduleId" AND amt."order" = ins."order" AND amt."period" = 'AM';

INSERT INTO "ScheduleWeek" ("turnId", "date", "week", "isHoliday", "createdAt", "updatedAt")
SELECT m.new_turn_id, w."date", w."week", w."isHoliday", NOW(), NOW()
FROM _pm_turn_map m
JOIN "ScheduleWeek" w ON w."turnId" = m.old_turn_id;

INSERT INTO "ScheduleTurnHoliday" ("turnId", "holidayId", "createdAt", "updatedAt")
SELECT m.new_turn_id, h."holidayId", NOW(), NOW()
FROM _pm_turn_map m
JOIN "ScheduleTurnHoliday" h ON h."turnId" = m.old_turn_id;

-- 4. Backfill weekday + school year onto existing rotation rows from the most
--    recently updated schedule for that class (rotation used to be neither
--    weekday- nor year-scoped).
UPDATE "TeacherRotation" r SET
  "selectedWeekday" = s."selectedWeekday",
  "schoolYearId" = s."schoolYearId"
FROM "Schedule" s
WHERE s.id = (
  SELECT s2.id FROM "Schedule" s2 WHERE s2."classId" = r."classId" ORDER BY s2."updatedAt" DESC LIMIT 1
);

-- 4b. Any rotation row still without a year (its class has no schedule) falls back
--     to the current, else most recent, school year — so schoolYearId is complete
--     and can become NOT NULL, keeping the composite unique key meaningful.
UPDATE "TeacherRotation" SET "schoolYearId" = (
  SELECT id FROM "SchoolYear" ORDER BY "isCurrent" DESC NULLS LAST, "startDate" DESC LIMIT 1
)
WHERE "schoolYearId" IS NULL
  AND EXISTS (SELECT 1 FROM "SchoolYear");

ALTER TABLE "TeacherRotation" ALTER COLUMN "schoolYearId" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- New, wider unique keys + supporting indexes.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "ScheduleTurn_scheduleId_period_order_key" ON "ScheduleTurn"("scheduleId", "period", "order");
CREATE UNIQUE INDEX "TeacherAssignment_classId_period_groupId_schoolYearId_selec_key" ON "TeacherAssignment"("classId", "period", "groupId", "schoolYearId", "selectedWeekday");
CREATE INDEX "TeacherRotation_classId_idx" ON "TeacherRotation"("classId");
CREATE INDEX "TeacherRotation_schoolYearId_idx" ON "TeacherRotation"("schoolYearId");
CREATE UNIQUE INDEX "TeacherRotation_classId_groupId_turnId_period_selectedWeekd_key" ON "TeacherRotation"("classId", "groupId", "turnId", "period", "selectedWeekday", "schoolYearId");
