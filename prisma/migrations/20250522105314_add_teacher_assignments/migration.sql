/*
  Warnings:

  - A unique constraint covering the columns `[firstName,lastName]` on the table `Teacher` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "TeacherAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "class" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "learningContent" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeacherAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TeacherAssignment_class_idx" ON "TeacherAssignment"("class");

-- CreateIndex
CREATE INDEX "TeacherAssignment_teacherId_idx" ON "TeacherAssignment"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAssignment_class_period_groupId_key" ON "TeacherAssignment"("class", "period", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_firstName_lastName_key" ON "Teacher"("firstName", "lastName");
