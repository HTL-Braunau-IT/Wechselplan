-- Phase 1b: Drop the orphan Absence table.
-- The 20260224130330_add_absence_model migration created this table, but no Prisma
-- model exists for it and no application code references it.

DROP TABLE IF EXISTS "Absence";
