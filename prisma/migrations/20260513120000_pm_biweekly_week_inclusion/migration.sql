-- CreateEnum
CREATE TYPE "PmBiweeklyAnchor" AS ENUM ('A_ON_ODD_WEEKS', 'A_ON_EVEN_WEEKS');

-- CreateEnum
CREATE TYPE "PmTrack" AS ENUM ('ALL', 'A', 'B');

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN "pmBiweeklyAnchor" "PmBiweeklyAnchor";

-- AlterTable
ALTER TABLE "ScheduleWeek" ADD COLUMN "includedInPlan" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "TeacherAssignment" ADD COLUMN "pmTrack" "PmTrack" NOT NULL DEFAULT 'ALL';
