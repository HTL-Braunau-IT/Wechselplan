-- Backfill: create school year 2025/2026 and set all existing data to it
INSERT INTO "SchoolYear" ("label", "startDate", "endDate", "semesterChangeDate", "createdAt", "updatedAt")
VALUES (
  '2025/2026',
  '2025-09-08'::timestamp,
  '2026-07-10'::timestamp,
  '2026-02-15'::timestamp,
  NOW(),
  NOW()
)
ON CONFLICT ("label") DO NOTHING;

-- Set schoolYearId on all existing rows (only if we have a SchoolYear 2025/2026)
UPDATE "Schedule"
SET "schoolYearId" = (SELECT id FROM "SchoolYear" WHERE "label" = '2025/2026' LIMIT 1)
WHERE "schoolYearId" IS NULL;

UPDATE "TeacherAssignment"
SET "schoolYearId" = (SELECT id FROM "SchoolYear" WHERE "label" = '2025/2026' LIMIT 1)
WHERE "schoolYearId" IS NULL;

UPDATE "Grade"
SET "schoolYearId" = (SELECT id FROM "SchoolYear" WHERE "label" = '2025/2026' LIMIT 1)
WHERE "schoolYearId" IS NULL;

UPDATE "FinalGrade"
SET "schoolYearId" = (SELECT id FROM "SchoolYear" WHERE "label" = '2025/2026' LIMIT 1)
WHERE "schoolYearId" IS NULL;

UPDATE "NotenmanagementTransfer"
SET "schoolYearId" = (SELECT id FROM "SchoolYear" WHERE "label" = '2025/2026' LIMIT 1)
WHERE "schoolYearId" IS NULL;

-- ClassMembership: one row per student that has a classId, for school year 2025/2026
INSERT INTO "ClassMembership" ("studentId", "classId", "schoolYearId", "createdAt", "updatedAt")
SELECT s.id, s."classId", (SELECT id FROM "SchoolYear" WHERE "label" = '2025/2026' LIMIT 1), NOW(), NOW()
FROM "Student" s
WHERE s."classId" IS NOT NULL
ON CONFLICT ("studentId", "schoolYearId") DO NOTHING;
