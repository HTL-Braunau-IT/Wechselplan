-- Phase 4: Collapse Subject / LearningContent / Room into a single
-- LookupValue table (with a kind enum) and re-point TeacherAssignment FKs.
-- API responses still return `{ id, name }`; the collapse is internal.

-- 1) Create the new enum + table.
CREATE TYPE "LookupKind" AS ENUM ('SUBJECT', 'LEARNING_CONTENT', 'ROOM');

CREATE TABLE "LookupValue" (
  "id"          SERIAL PRIMARY KEY,
  "kind"        "LookupKind" NOT NULL,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "capacity"    INTEGER,
  "isCustom"    BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- temporary column used only during this migration to remap legacy FKs
  "legacyId"    INTEGER
);

CREATE UNIQUE INDEX "LookupValue_kind_name_key" ON "LookupValue" ("kind", "name");
CREATE INDEX        "LookupValue_kind_idx"     ON "LookupValue" ("kind");
CREATE INDEX        "LookupValue_name_idx"     ON "LookupValue" ("name");

-- 2) Backfill from the three legacy tables. We keep the old id in `legacyId`
--    so we can rewrite TeacherAssignment FKs in the next step.
INSERT INTO "LookupValue" ("kind", "name", "description", "capacity", "isCustom", "createdAt", "updatedAt", "legacyId")
SELECT 'SUBJECT'::"LookupKind", "name", "description", NULL, "isCustom", "createdAt", "updatedAt", "id"
FROM "Subject";

INSERT INTO "LookupValue" ("kind", "name", "description", "capacity", "isCustom", "createdAt", "updatedAt", "legacyId")
SELECT 'LEARNING_CONTENT'::"LookupKind", "name", "description", NULL, "isCustom", "createdAt", "updatedAt", "id"
FROM "LearningContent";

INSERT INTO "LookupValue" ("kind", "name", "description", "capacity", "isCustom", "createdAt", "updatedAt", "legacyId")
SELECT 'ROOM'::"LookupKind", "name", "description", "capacity", "isCustom", "createdAt", "updatedAt", "id"
FROM "Room";

-- 3) Drop the legacy FKs on TeacherAssignment so we can repoint the columns.
ALTER TABLE "TeacherAssignment" DROP CONSTRAINT IF EXISTS "TeacherAssignment_subjectId_fkey";
ALTER TABLE "TeacherAssignment" DROP CONSTRAINT IF EXISTS "TeacherAssignment_learningContentId_fkey";
ALTER TABLE "TeacherAssignment" DROP CONSTRAINT IF EXISTS "TeacherAssignment_roomId_fkey";

-- 4) Remap each id column from the old (legacy) id to the new LookupValue id.
UPDATE "TeacherAssignment" ta
SET "subjectId" = lv."id"
FROM "LookupValue" lv
WHERE lv."kind" = 'SUBJECT' AND lv."legacyId" = ta."subjectId";

UPDATE "TeacherAssignment" ta
SET "learningContentId" = lv."id"
FROM "LookupValue" lv
WHERE lv."kind" = 'LEARNING_CONTENT' AND lv."legacyId" = ta."learningContentId";

UPDATE "TeacherAssignment" ta
SET "roomId" = lv."id"
FROM "LookupValue" lv
WHERE lv."kind" = 'ROOM' AND lv."legacyId" = ta."roomId";

-- 5) Re-add FKs against the unified table.
ALTER TABLE "TeacherAssignment"
  ADD CONSTRAINT "TeacherAssignment_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "LookupValue"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TeacherAssignment_learningContentId_fkey"
    FOREIGN KEY ("learningContentId") REFERENCES "LookupValue"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TeacherAssignment_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "LookupValue"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6) Drop the now-empty legacy tables.
DROP TABLE "Subject";
DROP TABLE "LearningContent";
DROP TABLE "Room";

-- 7) Drop the temporary helper column.
ALTER TABLE "LookupValue" DROP COLUMN "legacyId";
