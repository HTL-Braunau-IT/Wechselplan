-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "amStartDate" TIMESTAMP(3),
ADD COLUMN     "pmStartDate" TIMESTAMP(3),
ADD COLUMN     "excludedDates" TEXT[] DEFAULT ARRAY[]::TEXT[];
