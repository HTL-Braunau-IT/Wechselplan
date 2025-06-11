/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `SchoolHoliday` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "classHeadId" INTEGER,
ADD COLUMN     "classLeadId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "SchoolHoliday_name_key" ON "SchoolHoliday"("name");
