-- Phase 6: Drop Student.classId column. ClassMembership is now the sole
-- source of truth for the student <-> class relationship. Any rows in
-- Student that still had a non-null classId without a matching
-- ClassMembership for the current school year are backfilled into
-- ClassMembership before the column is removed, so we don't lose any
-- assignments that pre-date the per-year model.

DO $$
DECLARE
    current_year_id INTEGER;
BEGIN
    SELECT id INTO current_year_id
    FROM "SchoolYear"
    WHERE "isCurrent" = true
    ORDER BY id DESC
    LIMIT 1;

    IF current_year_id IS NULL THEN
        SELECT id INTO current_year_id
        FROM "SchoolYear"
        ORDER BY "startDate" DESC
        LIMIT 1;
    END IF;

    IF current_year_id IS NOT NULL THEN
        INSERT INTO "ClassMembership" ("studentId", "classId", "schoolYearId", "createdAt", "updatedAt")
        SELECT s.id, s."classId", current_year_id, NOW(), NOW()
        FROM "Student" s
        WHERE s."classId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "ClassMembership" cm
            WHERE cm."studentId" = s.id AND cm."schoolYearId" = current_year_id
          )
          AND EXISTS (
            SELECT 1 FROM "Class" c WHERE c.id = s."classId"
          );
    END IF;
END $$;

ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_classId_fkey";
DROP INDEX IF EXISTS "Student_classId_idx";
ALTER TABLE "Student" DROP COLUMN IF EXISTS "classId";
