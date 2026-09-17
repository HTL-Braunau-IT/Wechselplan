-- CreateTable
CREATE TABLE "NotenSeatingLayout" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "positions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotenSeatingLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotenSeatingLayout_teacherId_idx" ON "NotenSeatingLayout"("teacherId");

-- CreateIndex
CREATE INDEX "NotenSeatingLayout_classId_idx" ON "NotenSeatingLayout"("classId");

-- CreateIndex
CREATE INDEX "NotenSeatingLayout_schoolYearId_idx" ON "NotenSeatingLayout"("schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "NotenSeatingLayout_teacherId_classId_groupId_schoolYearId_key" ON "NotenSeatingLayout"("teacherId", "classId", "groupId", "schoolYearId");
