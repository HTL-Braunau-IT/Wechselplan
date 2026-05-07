-- Phase 5: Move classHead/classLead from a global Class column onto a
-- per-school-year join table (ClassYearStaff) so different teachers can
-- be Klassenvorstand / Klassenlehrer in different school years.

-- 1) Create the new join table.
CREATE TABLE "ClassYearStaff" (
  "id"           SERIAL PRIMARY KEY,
  "classId"      INTEGER NOT NULL,
  "schoolYearId" INTEGER NOT NULL,
  "classHeadId"  INTEGER,
  "classLeadId"  INTEGER,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ClassYearStaff_classId_schoolYearId_key"
  ON "ClassYearStaff" ("classId", "schoolYearId");
CREATE INDEX "ClassYearStaff_classId_idx"      ON "ClassYearStaff" ("classId");
CREATE INDEX "ClassYearStaff_schoolYearId_idx" ON "ClassYearStaff" ("schoolYearId");
CREATE INDEX "ClassYearStaff_classHeadId_idx"  ON "ClassYearStaff" ("classHeadId");
CREATE INDEX "ClassYearStaff_classLeadId_idx"  ON "ClassYearStaff" ("classLeadId");

ALTER TABLE "ClassYearStaff"
  ADD CONSTRAINT "ClassYearStaff_classId_fkey"
    FOREIGN KEY ("classId")      REFERENCES "Class"("id")      ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClassYearStaff_schoolYearId_fkey"
    FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClassYearStaff_classHeadId_fkey"
    FOREIGN KEY ("classHeadId")  REFERENCES "Teacher"("id")    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ClassYearStaff_classLeadId_fkey"
    FOREIGN KEY ("classLeadId")  REFERENCES "Teacher"("id")    ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Backfill: for every (class, schoolYear) pair that has any data
--    (memberships, schedules, grades, ...) copy the legacy head/lead
--    values from Class. We deduplicate via the unique key.
INSERT INTO "ClassYearStaff" ("classId", "schoolYearId", "classHeadId", "classLeadId", "createdAt", "updatedAt")
SELECT DISTINCT
  c."id"  AS "classId",
  sy."id" AS "schoolYearId",
  c."classHeadId",
  c."classLeadId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Class" c
CROSS JOIN "SchoolYear" sy
WHERE EXISTS (
  SELECT 1 FROM "ClassMembership" cm WHERE cm."classId" = c."id" AND cm."schoolYearId" = sy."id"
)
   OR EXISTS (
  SELECT 1 FROM "Schedule" s WHERE s."classId" = c."id" AND s."schoolYearId" = sy."id"
)
   OR EXISTS (
  SELECT 1 FROM "TeacherAssignment" ta WHERE ta."classId" = c."id" AND ta."schoolYearId" = sy."id"
)
   OR EXISTS (
  SELECT 1 FROM "Grade" g WHERE g."classId" = c."id" AND g."schoolYearId" = sy."id"
)
   OR EXISTS (
  SELECT 1 FROM "FinalGrade" fg WHERE fg."classId" = c."id" AND fg."schoolYearId" = sy."id"
)
ON CONFLICT ("classId", "schoolYearId") DO NOTHING;

-- 3) Drop legacy columns + their FKs from Class.
ALTER TABLE "Class" DROP CONSTRAINT IF EXISTS "Class_classHeadId_fkey";
ALTER TABLE "Class" DROP CONSTRAINT IF EXISTS "Class_classLeadId_fkey";
ALTER TABLE "Class" DROP COLUMN IF EXISTS "classHeadId";
ALTER TABLE "Class" DROP COLUMN IF EXISTS "classLeadId";
