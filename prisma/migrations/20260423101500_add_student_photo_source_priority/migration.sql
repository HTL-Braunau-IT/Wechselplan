ALTER TABLE "DirectorySyncSettings"
ADD COLUMN "studentPhotoSourcePriority" TEXT NOT NULL DEFAULT 'manual_first';
