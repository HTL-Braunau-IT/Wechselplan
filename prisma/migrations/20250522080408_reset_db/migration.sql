/*
  Warnings:

  - You are about to drop the `StudentGroupAssignment` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Student" ADD COLUMN "groupId" INTEGER;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "StudentGroupAssignment";
PRAGMA foreign_keys=on;

-- CreateIndex
CREATE INDEX "Student_groupId_idx" ON "Student"("groupId");
