-- CreateTable
CREATE TABLE "NotenWeightConfig" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "weightWiederholung" INTEGER NOT NULL DEFAULT 25,
    "weightBericht" INTEGER NOT NULL DEFAULT 25,
    "weightMitarbeit" INTEGER NOT NULL DEFAULT 25,
    "weightPraktischeArbeit" INTEGER NOT NULL DEFAULT 25,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotenWeightConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LehrstoffPerDay" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "period" TEXT NOT NULL,
    "lehrstoff" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LehrstoffPerDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotenEntry" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "period" TEXT NOT NULL,
    "attendance" TEXT,
    "wiederholung1" DOUBLE PRECISION,
    "wiederholung2" DOUBLE PRECISION,
    "bericht1" DOUBLE PRECISION,
    "bericht2" DOUBLE PRECISION,
    "mitarbeit1" DOUBLE PRECISION,
    "mitarbeit2" DOUBLE PRECISION,
    "praktischeArbeit1" DOUBLE PRECISION,
    "praktischeArbeit2" DOUBLE PRECISION,
    "notizen" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotenEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotenWeightConfig_teacherId_idx" ON "NotenWeightConfig"("teacherId");

-- CreateIndex
CREATE INDEX "NotenWeightConfig_classId_idx" ON "NotenWeightConfig"("classId");

-- CreateIndex
CREATE INDEX "NotenWeightConfig_schoolYearId_idx" ON "NotenWeightConfig"("schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "NotenWeightConfig_teacherId_classId_groupId_schoolYearId_key" ON "NotenWeightConfig"("teacherId", "classId", "groupId", "schoolYearId");

-- CreateIndex
CREATE INDEX "LehrstoffPerDay_teacherId_idx" ON "LehrstoffPerDay"("teacherId");

-- CreateIndex
CREATE INDEX "LehrstoffPerDay_classId_idx" ON "LehrstoffPerDay"("classId");

-- CreateIndex
CREATE INDEX "LehrstoffPerDay_schoolYearId_idx" ON "LehrstoffPerDay"("schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "LehrstoffPerDay_teacherId_classId_groupId_schoolYearId_date_key" ON "LehrstoffPerDay"("teacherId", "classId", "groupId", "schoolYearId", "date", "period");

-- CreateIndex
CREATE INDEX "NotenEntry_studentId_idx" ON "NotenEntry"("studentId");

-- CreateIndex
CREATE INDEX "NotenEntry_teacherId_idx" ON "NotenEntry"("teacherId");

-- CreateIndex
CREATE INDEX "NotenEntry_classId_idx" ON "NotenEntry"("classId");

-- CreateIndex
CREATE INDEX "NotenEntry_schoolYearId_idx" ON "NotenEntry"("schoolYearId");

-- CreateIndex
CREATE INDEX "NotenEntry_date_idx" ON "NotenEntry"("date");

-- CreateIndex
CREATE UNIQUE INDEX "NotenEntry_studentId_teacherId_classId_groupId_schoolYearId_key" ON "NotenEntry"("studentId", "teacherId", "classId", "groupId", "schoolYearId", "date", "period");
