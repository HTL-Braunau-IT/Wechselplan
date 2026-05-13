-- CreateTable
CREATE TABLE "GeneralSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "maxStudentsPerGroup" INTEGER NOT NULL DEFAULT 12,
    "maxScheduleGroups" INTEGER NOT NULL DEFAULT 4,
    "maxSupportedStudents" INTEGER NOT NULL DEFAULT 48,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneralSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "GeneralSettings" ("id", "maxStudentsPerGroup", "maxScheduleGroups", "maxSupportedStudents", "createdAt", "updatedAt")
VALUES (1, 12, 4, 48, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
