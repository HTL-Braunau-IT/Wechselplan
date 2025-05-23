/*
  Warnings:

  - You are about to drop the `_ScheduleToStudent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `class` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `period` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `room` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `subject` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `teacherId` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `weekDay` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `class` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `class` on the `TeacherAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `learningContent` on the `TeacherAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `room` on the `TeacherAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `subject` on the `TeacherAssignment` table. All the data in the column will be lost.
  - Added the required column `endDate` to the `Schedule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Schedule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scheduleData` to the `Schedule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `selectedWeekday` to the `Schedule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `Schedule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `classId` to the `TeacherAssignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `learningContentId` to the `TeacherAssignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roomId` to the `TeacherAssignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subjectId` to the `TeacherAssignment` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "SchoolHoliday_startDate_endDate_idx";

-- DropIndex
DROP INDEX "Teacher_firstName_lastName_key";

-- DropIndex
DROP INDEX "_ScheduleToStudent_B_index";

-- DropIndex
DROP INDEX "_ScheduleToStudent_AB_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_ScheduleToStudent";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Class" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "selectedWeekday" INTEGER NOT NULL,
    "scheduleData" JSONB NOT NULL,
    "classId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Schedule" ("createdAt", "id", "updatedAt") SELECT "createdAt", "id", "updatedAt" FROM "Schedule";
DROP TABLE "Schedule";
ALTER TABLE "new_Schedule" RENAME TO "Schedule";
CREATE INDEX "Schedule_classId_idx" ON "Schedule"("classId");
CREATE TABLE "new_Student" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "classId" INTEGER,
    "groupId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Student" ("createdAt", "firstName", "groupId", "id", "lastName", "updatedAt") SELECT "createdAt", "firstName", "groupId", "id", "lastName", "updatedAt" FROM "Student";
DROP TABLE "Student";
ALTER TABLE "new_Student" RENAME TO "Student";
CREATE INDEX "Student_firstName_lastName_idx" ON "Student"("firstName", "lastName");
CREATE INDEX "Student_groupId_idx" ON "Student"("groupId");
CREATE INDEX "Student_classId_idx" ON "Student"("classId");
CREATE TABLE "new_TeacherAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "learningContentId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeacherAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeacherAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeacherAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeacherAssignment_learningContentId_fkey" FOREIGN KEY ("learningContentId") REFERENCES "LearningContent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeacherAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TeacherAssignment" ("createdAt", "groupId", "id", "period", "teacherId", "updatedAt") SELECT "createdAt", "groupId", "id", "period", "teacherId", "updatedAt" FROM "TeacherAssignment";
DROP TABLE "TeacherAssignment";
ALTER TABLE "new_TeacherAssignment" RENAME TO "TeacherAssignment";
CREATE INDEX "TeacherAssignment_classId_idx" ON "TeacherAssignment"("classId");
CREATE INDEX "TeacherAssignment_teacherId_idx" ON "TeacherAssignment"("teacherId");
CREATE INDEX "TeacherAssignment_subjectId_idx" ON "TeacherAssignment"("subjectId");
CREATE INDEX "TeacherAssignment_learningContentId_idx" ON "TeacherAssignment"("learningContentId");
CREATE INDEX "TeacherAssignment_roomId_idx" ON "TeacherAssignment"("roomId");
CREATE UNIQUE INDEX "TeacherAssignment_classId_period_groupId_key" ON "TeacherAssignment"("classId", "period", "groupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Class_name_key" ON "Class"("name");

-- CreateIndex
CREATE INDEX "Class_name_idx" ON "Class"("name");
