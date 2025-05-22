-- CreateTable
CREATE TABLE "GroupAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "class" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StudentGroupAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentId" INTEGER NOT NULL,
    "groupAssignmentId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudentGroupAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentGroupAssignment_groupAssignmentId_fkey" FOREIGN KEY ("groupAssignmentId") REFERENCES "GroupAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GroupAssignment_class_idx" ON "GroupAssignment"("class");

-- CreateIndex
CREATE UNIQUE INDEX "GroupAssignment_class_groupId_key" ON "GroupAssignment"("class", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGroupAssignment_studentId_groupAssignmentId_key" ON "StudentGroupAssignment"("studentId", "groupAssignmentId");
