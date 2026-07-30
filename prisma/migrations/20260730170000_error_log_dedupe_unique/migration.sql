-- Collapse any duplicate dedupeKey rows the previous non-unique index allowed,
-- keeping the most recently seen row per key, before enforcing uniqueness.
DELETE FROM "ErrorLog" a
USING "ErrorLog" b
WHERE a."dedupeKey" = b."dedupeKey"
  AND (a."lastSeenAt" < b."lastSeenAt"
       OR (a."lastSeenAt" = b."lastSeenAt" AND a."id" > b."id"));

-- DropIndex
DROP INDEX "ErrorLog_dedupeKey_idx";

-- CreateIndex
CREATE UNIQUE INDEX "ErrorLog_dedupeKey_key" ON "ErrorLog"("dedupeKey");
