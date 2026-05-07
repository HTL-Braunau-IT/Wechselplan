-- 1) Extend schema (temporarily nullable for backfill)
ALTER TABLE "TeacherRotation"
ADD COLUMN "schoolYearId" INTEGER,
ADD COLUMN "selectedWeekday" INTEGER;

-- 2) Remove old unique to allow duplicating rows per weekday/school year
DROP INDEX IF EXISTS "TeacherRotation_classId_groupId_turnId_period_key";

-- 3) Backfill from TeacherAssignment (same class/group/period/teacher)
WITH assignment_dims AS (
  SELECT DISTINCT
    ta."classId",
    ta."groupId",
    ta."period",
    ta."teacherId",
    ta."schoolYearId",
    ta."selectedWeekday"
  FROM "TeacherAssignment" ta
)
INSERT INTO "TeacherRotation" (
  "classId",
  "groupId",
  "teacherId",
  "turnId",
  "period",
  "schoolYearId",
  "selectedWeekday",
  "createdAt",
  "updatedAt"
)
SELECT
  tr."classId",
  tr."groupId",
  tr."teacherId",
  tr."turnId",
  tr."period",
  ad."schoolYearId",
  ad."selectedWeekday",
  tr."createdAt",
  tr."updatedAt"
FROM "TeacherRotation" tr
JOIN assignment_dims ad
  ON ad."classId" = tr."classId"
 AND ad."groupId" = tr."groupId"
 AND ad."period" = tr."period"
 AND ad."teacherId" = tr."teacherId"
WHERE tr."schoolYearId" IS NULL
  AND tr."selectedWeekday" IS NULL;

-- 4) Fallback for unmatched legacy rows:
--    assign current school year (if flagged), otherwise latest by startDate; weekday defaults to Monday (1)
WITH current_or_latest_school_year AS (
  SELECT sy."id"
  FROM "SchoolYear" sy
  ORDER BY
    CASE WHEN sy."isCurrent" = true THEN 0 ELSE 1 END,
    sy."startDate" DESC
  LIMIT 1
),
unmatched_rows AS (
  SELECT tr.*
  FROM "TeacherRotation" tr
  LEFT JOIN "TeacherAssignment" ta
    ON ta."classId" = tr."classId"
   AND ta."groupId" = tr."groupId"
   AND ta."period" = tr."period"
   AND ta."teacherId" = tr."teacherId"
  WHERE tr."schoolYearId" IS NULL
    AND tr."selectedWeekday" IS NULL
    AND ta."id" IS NULL
)
INSERT INTO "TeacherRotation" (
  "classId",
  "groupId",
  "teacherId",
  "turnId",
  "period",
  "schoolYearId",
  "selectedWeekday",
  "createdAt",
  "updatedAt"
)
SELECT
  ur."classId",
  ur."groupId",
  ur."teacherId",
  ur."turnId",
  ur."period",
  sy."id",
  1,
  ur."createdAt",
  ur."updatedAt"
FROM unmatched_rows ur
CROSS JOIN current_or_latest_school_year sy;

-- 5) Remove legacy rows (without dimensions)
DELETE FROM "TeacherRotation"
WHERE "schoolYearId" IS NULL
   OR "selectedWeekday" IS NULL;

-- 6) Finalize constraints and indexes
ALTER TABLE "TeacherRotation"
ALTER COLUMN "schoolYearId" SET NOT NULL,
ALTER COLUMN "selectedWeekday" SET NOT NULL;

ALTER TABLE "TeacherRotation"
ADD CONSTRAINT "TeacherRotation_schoolYearId_fkey"
FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TeacherRotation_classId_groupId_turnId_period_schoolYearId_select_key"
ON "TeacherRotation" ("classId", "groupId", "turnId", "period", "schoolYearId", "selectedWeekday");

CREATE INDEX "TeacherRotation_teacherId_schoolYearId_selectedWeekday_idx"
ON "TeacherRotation" ("teacherId", "schoolYearId", "selectedWeekday");

CREATE INDEX "TeacherRotation_classId_schoolYearId_selectedWeekday_idx"
ON "TeacherRotation" ("classId", "schoolYearId", "selectedWeekday");
