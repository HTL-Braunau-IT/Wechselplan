/*
  Warnings:

  - You are about to drop the column `teacher` on the `Schedule` table. All the data in the column will be lost.
  - Added the required column `teacherId` to the `Schedule` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Teacher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "class" TEXT NOT NULL,
    "weekDay" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "room" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Schedule" ("class", "createdAt", "id", "period", "room", "subject", "updatedAt", "weekDay") SELECT "class", "createdAt", "id", "period", "room", "subject", "updatedAt", "weekDay" FROM "Schedule";
DROP TABLE "Schedule";
ALTER TABLE "new_Schedule" RENAME TO "Schedule";
CREATE INDEX "Schedule_class_idx" ON "Schedule"("class");
CREATE INDEX "Schedule_teacherId_idx" ON "Schedule"("teacherId");
CREATE UNIQUE INDEX "Schedule_class_weekDay_period_key" ON "Schedule"("class", "weekDay", "period");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Teacher_firstName_lastName_idx" ON "Teacher"("firstName", "lastName");
