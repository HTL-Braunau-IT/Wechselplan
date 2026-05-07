-- Backfill StudentWeekdayGroup from legacy Student.groupId for weekdays 1..5
INSERT INTO "StudentWeekdayGroup" ("studentId", "schoolYearId", "weekday", "groupId", "createdAt", "updatedAt")
SELECT
  s."id" AS "studentId",
  cm."schoolYearId",
  w."weekday",
  s."groupId",
  NOW(),
  NOW()
FROM "Student" s
JOIN "ClassMembership" cm
  ON cm."studentId" = s."id"
CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS w("weekday")
LEFT JOIN "StudentWeekdayGroup" swg
  ON swg."studentId" = s."id"
 AND swg."schoolYearId" = cm."schoolYearId"
 AND swg."weekday" = w."weekday"
WHERE s."groupId" IS NOT NULL
  AND s."groupId" <> 0
  AND swg."id" IS NULL;

DROP TABLE IF EXISTS "GroupAssignment";

ALTER TABLE "Student"
DROP COLUMN IF EXISTS "groupId";
