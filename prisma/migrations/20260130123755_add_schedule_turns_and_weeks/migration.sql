-- AlterTable
ALTER TABLE "LearningContent" ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Schedule" ALTER COLUMN "scheduleData" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ScheduleTurn" (
    "id" SERIAL NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "customLength" INTEGER,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleWeek" (
    "id" SERIAL NOT NULL,
    "turnId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTurnHoliday" (
    "id" SERIAL NOT NULL,
    "turnId" INTEGER NOT NULL,
    "holidayId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTurnHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleTurn_scheduleId_idx" ON "ScheduleTurn"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTurn_scheduleId_order_key" ON "ScheduleTurn"("scheduleId", "order");

-- CreateIndex
CREATE INDEX "ScheduleWeek_turnId_idx" ON "ScheduleWeek"("turnId");

-- CreateIndex
CREATE INDEX "ScheduleWeek_date_idx" ON "ScheduleWeek"("date");

-- CreateIndex
CREATE INDEX "ScheduleTurnHoliday_turnId_idx" ON "ScheduleTurnHoliday"("turnId");

-- CreateIndex
CREATE INDEX "ScheduleTurnHoliday_holidayId_idx" ON "ScheduleTurnHoliday"("holidayId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTurnHoliday_turnId_holidayId_key" ON "ScheduleTurnHoliday"("turnId", "holidayId");

-- AddForeignKey
ALTER TABLE "ScheduleTurn" ADD CONSTRAINT "ScheduleTurn_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleWeek" ADD CONSTRAINT "ScheduleWeek_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "ScheduleTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTurnHoliday" ADD CONSTRAINT "ScheduleTurnHoliday_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "ScheduleTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTurnHoliday" ADD CONSTRAINT "ScheduleTurnHoliday_holidayId_fkey" FOREIGN KEY ("holidayId") REFERENCES "SchoolHoliday"("id") ON DELETE CASCADE ON UPDATE CASCADE;
