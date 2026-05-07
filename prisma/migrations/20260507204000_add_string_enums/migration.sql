-- Phase 3b: Replace open-ended String columns with proper Postgres enums.
-- These are backwards-compatible at the API layer because the JSON-serialized
-- values stay identical (e.g. 'AM', 'first', 'Anwesend', 'manual_first').

-- 1) Create the enum types.
CREATE TYPE "Semester" AS ENUM ('first', 'second');
CREATE TYPE "DayPart" AS ENUM ('AM', 'PM');
CREATE TYPE "BreakPeriod" AS ENUM ('AM', 'PM', 'LUNCH');
CREATE TYPE "AttendanceState" AS ENUM ('Anwesend', 'Krank', 'Entschuldigt', 'Unentschuldigt');
CREATE TYPE "SyncMode" AS ENUM ('hybrid', 'nightly_only');
CREATE TYPE "StudentSyncStatus" AS ENUM ('active', 'unassigned');
CREATE TYPE "SemesterPlan" AS ENUM ('first', 'second');
CREATE TYPE "PhotoSourcePriority" AS ENUM ('manual_first', 'o365_first');

-- 2) Sanitize any unexpected pre-existing values so the USING cast can't fail.
UPDATE "Student"  SET "syncStatus" = NULL                          WHERE "syncStatus"  IS NOT NULL AND "syncStatus"  NOT IN ('active','unassigned');
UPDATE "Schedule" SET "semesterPlanning" = NULL                    WHERE "semesterPlanning" IS NOT NULL AND "semesterPlanning" NOT IN ('first','second');
UPDATE "TeacherAssignment" SET "period" = 'AM'                     WHERE "period" NOT IN ('AM','PM');
UPDATE "ScheduleTime"      SET "period" = 'AM'                     WHERE "period" NOT IN ('AM','PM');
UPDATE "BreakTime"         SET "period" = 'AM'                     WHERE "period" NOT IN ('AM','PM','LUNCH');
UPDATE "TeacherRotation"   SET "period" = 'AM'                     WHERE "period" NOT IN ('AM','PM');
UPDATE "LehrstoffPerDay"   SET "period" = 'AM'                     WHERE "period" NOT IN ('AM','PM');
UPDATE "NotenEntry"        SET "period" = 'AM'                     WHERE "period" NOT IN ('AM','PM');
UPDATE "NotenEntry"        SET "attendance" = NULL                 WHERE "attendance" IS NOT NULL AND "attendance" NOT IN ('Anwesend','Krank','Entschuldigt','Unentschuldigt');
UPDATE "Grade"             SET "semester" = 'first'                WHERE "semester" NOT IN ('first','second');
UPDATE "FinalGrade"        SET "semester" = 'first'                WHERE "semester" NOT IN ('first','second');
UPDATE "NotenmanagementTransfer" SET "semester" = 'first'          WHERE "semester" NOT IN ('first','second');
UPDATE "DirectorySyncSettings" SET "syncMode" = 'hybrid'           WHERE "syncMode" NOT IN ('hybrid','nightly_only');
UPDATE "DirectorySyncSettings" SET "studentPhotoSourcePriority" = 'manual_first' WHERE "studentPhotoSourcePriority" NOT IN ('manual_first','o365_first');
UPDATE "DirectorySyncSettings" SET "teacherPhotoSourcePriority" = 'manual_first' WHERE "teacherPhotoSourcePriority" NOT IN ('manual_first','o365_first');

-- 3) Convert each column to its enum type via USING cast.
ALTER TABLE "Student"
  ALTER COLUMN "syncStatus" TYPE "StudentSyncStatus" USING "syncStatus"::"StudentSyncStatus";

ALTER TABLE "Schedule"
  ALTER COLUMN "semesterPlanning" TYPE "SemesterPlan" USING "semesterPlanning"::"SemesterPlan";

ALTER TABLE "TeacherAssignment"
  ALTER COLUMN "period" TYPE "DayPart" USING "period"::"DayPart";

ALTER TABLE "ScheduleTime"
  ALTER COLUMN "period" TYPE "DayPart" USING "period"::"DayPart";

ALTER TABLE "BreakTime"
  ALTER COLUMN "period" TYPE "BreakPeriod" USING "period"::"BreakPeriod";

ALTER TABLE "TeacherRotation"
  ALTER COLUMN "period" TYPE "DayPart" USING "period"::"DayPart";

ALTER TABLE "LehrstoffPerDay"
  ALTER COLUMN "period" TYPE "DayPart" USING "period"::"DayPart";

ALTER TABLE "NotenEntry"
  ALTER COLUMN "period" TYPE "DayPart" USING "period"::"DayPart",
  ALTER COLUMN "attendance" TYPE "AttendanceState" USING "attendance"::"AttendanceState";

ALTER TABLE "Grade"
  ALTER COLUMN "semester" TYPE "Semester" USING "semester"::"Semester";

ALTER TABLE "FinalGrade"
  ALTER COLUMN "semester" TYPE "Semester" USING "semester"::"Semester";

ALTER TABLE "NotenmanagementTransfer"
  ALTER COLUMN "semester" TYPE "Semester" USING "semester"::"Semester";

-- DirectorySyncSettings has defaults that need to be re-applied with the new enum type.
ALTER TABLE "DirectorySyncSettings"
  ALTER COLUMN "syncMode" DROP DEFAULT,
  ALTER COLUMN "syncMode" TYPE "SyncMode" USING "syncMode"::"SyncMode",
  ALTER COLUMN "syncMode" SET DEFAULT 'hybrid'::"SyncMode";

ALTER TABLE "DirectorySyncSettings"
  ALTER COLUMN "studentPhotoSourcePriority" DROP DEFAULT,
  ALTER COLUMN "studentPhotoSourcePriority" TYPE "PhotoSourcePriority" USING "studentPhotoSourcePriority"::"PhotoSourcePriority",
  ALTER COLUMN "studentPhotoSourcePriority" SET DEFAULT 'manual_first'::"PhotoSourcePriority";

ALTER TABLE "DirectorySyncSettings"
  ALTER COLUMN "teacherPhotoSourcePriority" DROP DEFAULT,
  ALTER COLUMN "teacherPhotoSourcePriority" TYPE "PhotoSourcePriority" USING "teacherPhotoSourcePriority"::"PhotoSourcePriority",
  ALTER COLUMN "teacherPhotoSourcePriority" SET DEFAULT 'manual_first'::"PhotoSourcePriority";
