-- CreateTable
CREATE TABLE "_ScheduleToScheduleTime" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ScheduleToScheduleTime_A_fkey" FOREIGN KEY ("A") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ScheduleToScheduleTime_B_fkey" FOREIGN KEY ("B") REFERENCES "ScheduleTime" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_BreakTimeToSchedule" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_BreakTimeToSchedule_A_fkey" FOREIGN KEY ("A") REFERENCES "BreakTime" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BreakTimeToSchedule_B_fkey" FOREIGN KEY ("B") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_ScheduleToScheduleTime_AB_unique" ON "_ScheduleToScheduleTime"("A", "B");

-- CreateIndex
CREATE INDEX "_ScheduleToScheduleTime_B_index" ON "_ScheduleToScheduleTime"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_BreakTimeToSchedule_AB_unique" ON "_BreakTimeToSchedule"("A", "B");

-- CreateIndex
CREATE INDEX "_BreakTimeToSchedule_B_index" ON "_BreakTimeToSchedule"("B");
