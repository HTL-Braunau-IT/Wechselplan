-- Phase 2a: Add proper FK relations (with cascade) to the Noten tables.
-- These tables previously carried integer columns referencing Student/Teacher/Class/SchoolYear
-- without enforcing foreign keys. Add referential integrity + cascade-delete behavior.

-- 1) Clean up any orphan rows that would otherwise prevent FK creation.
DELETE FROM "NotenWeightConfig"
WHERE NOT EXISTS (SELECT 1 FROM "Teacher"    t WHERE t."id" = "NotenWeightConfig"."teacherId")
   OR NOT EXISTS (SELECT 1 FROM "Class"      c WHERE c."id" = "NotenWeightConfig"."classId")
   OR NOT EXISTS (SELECT 1 FROM "SchoolYear" y WHERE y."id" = "NotenWeightConfig"."schoolYearId");

DELETE FROM "LehrstoffPerDay"
WHERE NOT EXISTS (SELECT 1 FROM "Teacher"    t WHERE t."id" = "LehrstoffPerDay"."teacherId")
   OR NOT EXISTS (SELECT 1 FROM "Class"      c WHERE c."id" = "LehrstoffPerDay"."classId")
   OR NOT EXISTS (SELECT 1 FROM "SchoolYear" y WHERE y."id" = "LehrstoffPerDay"."schoolYearId");

DELETE FROM "NotenEntry"
WHERE NOT EXISTS (SELECT 1 FROM "Student"    s WHERE s."id" = "NotenEntry"."studentId")
   OR NOT EXISTS (SELECT 1 FROM "Teacher"    t WHERE t."id" = "NotenEntry"."teacherId")
   OR NOT EXISTS (SELECT 1 FROM "Class"      c WHERE c."id" = "NotenEntry"."classId")
   OR NOT EXISTS (SELECT 1 FROM "SchoolYear" y WHERE y."id" = "NotenEntry"."schoolYearId");

-- 2) Add foreign-key constraints with cascade-delete.
ALTER TABLE "NotenWeightConfig"
  ADD CONSTRAINT "NotenWeightConfig_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NotenWeightConfig_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "Class"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NotenWeightConfig_schoolYearId_fkey"
    FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LehrstoffPerDay"
  ADD CONSTRAINT "LehrstoffPerDay_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LehrstoffPerDay_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "Class"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LehrstoffPerDay_schoolYearId_fkey"
    FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotenEntry"
  ADD CONSTRAINT "NotenEntry_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NotenEntry_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NotenEntry_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "Class"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NotenEntry_schoolYearId_fkey"
    FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
