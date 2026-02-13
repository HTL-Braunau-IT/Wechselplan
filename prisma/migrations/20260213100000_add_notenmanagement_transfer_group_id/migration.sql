-- AlterTable: add optional groupId to NotenmanagementTransfer (null = class-level, set = group-level Notenstand)
ALTER TABLE "NotenmanagementTransfer" ADD COLUMN "groupId" INTEGER;

-- Drop old unique constraint and create new one including groupId
DROP INDEX IF EXISTS "NotenmanagementTransfer_classId_semester_schoolYearId_key";
CREATE UNIQUE INDEX "NotenmanagementTransfer_classId_groupId_semester_schoolYearId_key" ON "NotenmanagementTransfer"("classId", "groupId", "semester", "schoolYearId");
