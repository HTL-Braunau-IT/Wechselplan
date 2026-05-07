-- Phase 3a: Normalize ScheduleWeek.date (was String "dd.MM.yy") to DATE
-- and ScheduleWeek.week (was String "KW##") to INTEGER (ISO week number).
-- Display formatting now happens at the API boundary, not in the DB.

-- 1) Add new columns nullable, then backfill, then swap.
ALTER TABLE "ScheduleWeek" ADD COLUMN "date_new" DATE;
ALTER TABLE "ScheduleWeek" ADD COLUMN "week_new" INTEGER;

-- Backfill: parse the legacy dd.MM.yy date strings.
UPDATE "ScheduleWeek"
SET "date_new" = TO_DATE("date", 'DD.MM.YY');

-- Backfill: strip the leading "KW" and cast to int.
UPDATE "ScheduleWeek"
SET "week_new" = CASE
  WHEN "week" ~ '^KW[0-9]+$' THEN substring("week" from 3)::int
  WHEN "week" ~ '^[0-9]+$'   THEN "week"::int
  ELSE NULL
END;

-- Any row that failed to parse becomes the ISO week of date_new (best-effort).
UPDATE "ScheduleWeek"
SET "week_new" = EXTRACT(WEEK FROM "date_new")::int
WHERE "week_new" IS NULL AND "date_new" IS NOT NULL;

-- Drop legacy index on the old text date.
DROP INDEX IF EXISTS "ScheduleWeek_date_idx";

-- Swap columns.
ALTER TABLE "ScheduleWeek" DROP COLUMN "date";
ALTER TABLE "ScheduleWeek" DROP COLUMN "week";
ALTER TABLE "ScheduleWeek" RENAME COLUMN "date_new" TO "date";
ALTER TABLE "ScheduleWeek" RENAME COLUMN "week_new" TO "week";

-- Recreate constraints/indexes to match the new types.
ALTER TABLE "ScheduleWeek" ALTER COLUMN "date" SET NOT NULL;
ALTER TABLE "ScheduleWeek" ALTER COLUMN "week" SET NOT NULL;

CREATE INDEX "ScheduleWeek_date_idx" ON "ScheduleWeek" ("date");
