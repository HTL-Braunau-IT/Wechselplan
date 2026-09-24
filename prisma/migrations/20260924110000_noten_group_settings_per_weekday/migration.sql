-- Group weights and seat plans become per weekday, like the groups themselves
-- (see StudentWeekdayGroup). Each existing row is moved to the teacher's first
-- teaching day for that class and copied to every other day they teach it, so
-- no teacher loses a setting. Rows for a class the teacher no longer teaches
-- land on Monday (1).

-- NotenWeightConfig ----------------------------------------------------------
ALTER TABLE "NotenWeightConfig" ADD COLUMN "selectedWeekday" INTEGER NOT NULL DEFAULT 1;

UPDATE "NotenWeightConfig" w
SET "selectedWeekday" = d.first_day
FROM (
    SELECT "teacherId", "classId", "schoolYearId", MIN("selectedWeekday") AS first_day
    FROM "TeacherAssignment"
    GROUP BY 1, 2, 3
) d
WHERE d."teacherId" = w."teacherId" AND d."classId" = w."classId" AND d."schoolYearId" = w."schoolYearId";

DROP INDEX "NotenWeightConfig_teacherId_classId_groupId_schoolYearId_key";
CREATE UNIQUE INDEX "NotenWeightConfig_teacher_group_day_key"
    ON "NotenWeightConfig"("teacherId", "classId", "groupId", "schoolYearId", "selectedWeekday");

INSERT INTO "NotenWeightConfig"
    ("teacherId", "classId", "groupId", "schoolYearId", "selectedWeekday",
     "weightWiederholung", "weightBericht", "weightMitarbeit", "weightPraktischeArbeit", "updatedAt")
SELECT DISTINCT w."teacherId", w."classId", w."groupId", w."schoolYearId", ta."selectedWeekday",
       w."weightWiederholung", w."weightBericht", w."weightMitarbeit", w."weightPraktischeArbeit", CURRENT_TIMESTAMP
FROM "NotenWeightConfig" w
JOIN "TeacherAssignment" ta
  ON ta."teacherId" = w."teacherId" AND ta."classId" = w."classId" AND ta."schoolYearId" = w."schoolYearId"
WHERE ta."selectedWeekday" <> w."selectedWeekday"
ON CONFLICT DO NOTHING;

ALTER TABLE "NotenWeightConfig" ALTER COLUMN "selectedWeekday" DROP DEFAULT;

-- NotenSeatingLayout ---------------------------------------------------------
ALTER TABLE "NotenSeatingLayout" ADD COLUMN "selectedWeekday" INTEGER NOT NULL DEFAULT 1;

UPDATE "NotenSeatingLayout" l
SET "selectedWeekday" = d.first_day
FROM (
    SELECT "teacherId", "classId", "schoolYearId", MIN("selectedWeekday") AS first_day
    FROM "TeacherAssignment"
    GROUP BY 1, 2, 3
) d
WHERE d."teacherId" = l."teacherId" AND d."classId" = l."classId" AND d."schoolYearId" = l."schoolYearId";

DROP INDEX "NotenSeatingLayout_teacherId_classId_groupId_schoolYearId_key";
CREATE UNIQUE INDEX "NotenSeatingLayout_teacher_group_day_key"
    ON "NotenSeatingLayout"("teacherId", "classId", "groupId", "schoolYearId", "selectedWeekday");

INSERT INTO "NotenSeatingLayout"
    ("teacherId", "classId", "groupId", "schoolYearId", "selectedWeekday", "positions", "updatedAt")
SELECT DISTINCT ON (l."id", ta."selectedWeekday")
       l."teacherId", l."classId", l."groupId", l."schoolYearId", ta."selectedWeekday", l."positions", CURRENT_TIMESTAMP
FROM "NotenSeatingLayout" l
JOIN "TeacherAssignment" ta
  ON ta."teacherId" = l."teacherId" AND ta."classId" = l."classId" AND ta."schoolYearId" = l."schoolYearId"
WHERE ta."selectedWeekday" <> l."selectedWeekday"
ON CONFLICT DO NOTHING;

ALTER TABLE "NotenSeatingLayout" ALTER COLUMN "selectedWeekday" DROP DEFAULT;
