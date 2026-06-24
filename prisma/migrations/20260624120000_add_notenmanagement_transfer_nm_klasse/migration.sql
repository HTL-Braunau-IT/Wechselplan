-- AlterTable: add real Notenmanagement class name to NotenmanagementTransfer.
-- Combined Wechselplan classes (e.g. "2AFELC3AFELCMittwoch") are split into one LF per
-- real class ("2AFELC", "3AFELC"), so a single (class, group, semester, year) can map to
-- several LFs distinguished by nmKlasse.
ALTER TABLE "NotenmanagementTransfer" ADD COLUMN "nmKlasse" TEXT;

-- Drop old unique constraint and create new one including nmKlasse (explicit short name to stay under Postgres' 63-char identifier limit)
DROP INDEX IF EXISTS "NotenmanagementTransfer_classId_groupId_semester_schoolYearId_key";
CREATE UNIQUE INDEX "NotenmanagementTransfer_split_key" ON "NotenmanagementTransfer"("classId", "groupId", "semester", "schoolYearId", "nmKlasse");
