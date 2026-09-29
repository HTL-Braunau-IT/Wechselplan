-- An inverted range is silently harmful: the cadence engine treats a holiday whose
-- end precedes its start as matching no date, so the whole break becomes teaching
-- weeks in every plan saved afterwards (Weihnachten 24.12. → 06.12. did exactly
-- that in 2026/27). The API validates too; this is the backstop for every path.
-- Prisma does not model CHECK constraints, so they live only in migrations.
ALTER TABLE "SchoolHoliday"
  ADD CONSTRAINT "SchoolHoliday_date_range_check" CHECK ("endDate" >= "startDate");

ALTER TABLE "SchoolYear"
  ADD CONSTRAINT "SchoolYear_date_range_check" CHECK (
    "endDate" > "startDate"
    AND "semesterChangeDate" BETWEEN "startDate" AND "endDate"
  );
