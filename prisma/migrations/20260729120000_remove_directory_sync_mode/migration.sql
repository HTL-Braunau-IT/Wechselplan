-- The syncMode setting ('hybrid' / 'nightly_only') was plumbed through the DB,
-- the API and the settings UI, but nothing ever branched on it: both values
-- behaved identically. Scheduling is driven entirely by whether an external
-- scheduler calls POST /api/sync/run, and syncEnabled gates that run.
ALTER TABLE "DirectorySyncSettings" DROP COLUMN "syncMode";
