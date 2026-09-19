-- Noten weight hierarchy: add class-level and global-level weight configs above
-- the existing per-group NotenWeightConfig. Weights now resolve per teacher as
-- group -> class -> global -> 25/25/25/25.

-- CreateTable
CREATE TABLE "NotenWeightClassConfig" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "weightWiederholung" INTEGER NOT NULL DEFAULT 25,
    "weightBericht" INTEGER NOT NULL DEFAULT 25,
    "weightMitarbeit" INTEGER NOT NULL DEFAULT 25,
    "weightPraktischeArbeit" INTEGER NOT NULL DEFAULT 25,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotenWeightClassConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotenWeightGlobalConfig" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "weightWiederholung" INTEGER NOT NULL DEFAULT 25,
    "weightBericht" INTEGER NOT NULL DEFAULT 25,
    "weightMitarbeit" INTEGER NOT NULL DEFAULT 25,
    "weightPraktischeArbeit" INTEGER NOT NULL DEFAULT 25,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotenWeightGlobalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotenWeightClassConfig_teacherId_idx" ON "NotenWeightClassConfig"("teacherId");

-- CreateIndex
CREATE INDEX "NotenWeightClassConfig_classId_idx" ON "NotenWeightClassConfig"("classId");

-- CreateIndex
CREATE INDEX "NotenWeightClassConfig_schoolYearId_idx" ON "NotenWeightClassConfig"("schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "NotenWeightClassConfig_teacherId_classId_schoolYearId_key" ON "NotenWeightClassConfig"("teacherId", "classId", "schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "NotenWeightGlobalConfig_teacherId_key" ON "NotenWeightGlobalConfig"("teacherId");

-- Data migration: collapse redundant per-group rows into a class default.
-- Where a teacher has two or more group rows in the same (class, year) that all
-- carry the identical split, promote that split to the class level and drop the
-- now-redundant group rows so untouched groups in the class inherit it too.
INSERT INTO "NotenWeightClassConfig" (
    "teacherId", "classId", "schoolYearId",
    "weightWiederholung", "weightBericht", "weightMitarbeit", "weightPraktischeArbeit",
    "createdAt", "updatedAt"
)
SELECT
    "teacherId", "classId", "schoolYearId",
    MIN("weightWiederholung"), MIN("weightBericht"), MIN("weightMitarbeit"), MIN("weightPraktischeArbeit"),
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "NotenWeightConfig"
GROUP BY "teacherId", "classId", "schoolYearId"
HAVING COUNT(*) > 1
   AND MIN("weightWiederholung") = MAX("weightWiederholung")
   AND MIN("weightBericht") = MAX("weightBericht")
   AND MIN("weightMitarbeit") = MAX("weightMitarbeit")
   AND MIN("weightPraktischeArbeit") = MAX("weightPraktischeArbeit");

DELETE FROM "NotenWeightConfig" g
WHERE EXISTS (
    SELECT 1 FROM "NotenWeightClassConfig" c
    WHERE c."teacherId" = g."teacherId"
      AND c."classId" = g."classId"
      AND c."schoolYearId" = g."schoolYearId"
      AND c."weightWiederholung" = g."weightWiederholung"
      AND c."weightBericht" = g."weightBericht"
      AND c."weightMitarbeit" = g."weightMitarbeit"
      AND c."weightPraktischeArbeit" = g."weightPraktischeArbeit"
);
