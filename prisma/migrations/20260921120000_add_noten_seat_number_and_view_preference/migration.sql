-- CreateTable
CREATE TABLE "NotenSeatNumber" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "seatNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotenSeatNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotenSeatNumber_teacherId_idx" ON "NotenSeatNumber"("teacherId");

-- CreateIndex
CREATE INDEX "NotenSeatNumber_studentId_idx" ON "NotenSeatNumber"("studentId");

-- CreateIndex
CREATE INDEX "NotenSeatNumber_schoolYearId_idx" ON "NotenSeatNumber"("schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "NotenSeatNumber_teacherId_studentId_schoolYearId_key" ON "NotenSeatNumber"("teacherId", "studentId", "schoolYearId");

-- CreateTable
CREATE TABLE "NotenViewPreference" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "seatingModeDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotenViewPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotenViewPreference_teacherId_key" ON "NotenViewPreference"("teacherId");
