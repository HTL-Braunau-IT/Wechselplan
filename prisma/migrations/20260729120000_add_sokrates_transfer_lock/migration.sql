-- CreateTable
CREATE TABLE "SokratesTransfer" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "semester" TEXT NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "markedById" INTEGER NOT NULL,
    "markedByName" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAll" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SokratesTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SokratesSubjectLock" (
    "id" SERIAL NOT NULL,
    "transferId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SokratesSubjectLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SokratesChangeNotice" (
    "id" SERIAL NOT NULL,
    "transferId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "className" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "studentName" TEXT NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "subjectTeacherName" TEXT NOT NULL,
    "oldGrade" DOUBLE PRECISION,
    "newGrade" DOUBLE PRECISION,
    "changedById" INTEGER,
    "changedByName" TEXT NOT NULL,
    "recipientId" INTEGER,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "SokratesChangeNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SokratesTransfer_classId_schoolYearId_idx" ON "SokratesTransfer"("classId", "schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "SokratesTransfer_classId_semester_schoolYearId_key" ON "SokratesTransfer"("classId", "semester", "schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "SokratesSubjectLock_transferId_teacherId_key" ON "SokratesSubjectLock"("transferId", "teacherId");

-- CreateIndex
CREATE INDEX "SokratesChangeNotice_transferId_idx" ON "SokratesChangeNotice"("transferId");

-- CreateIndex
CREATE INDEX "SokratesChangeNotice_classId_schoolYearId_idx" ON "SokratesChangeNotice"("classId", "schoolYearId");

-- CreateIndex
CREATE INDEX "SokratesChangeNotice_recipientId_acknowledgedAt_idx" ON "SokratesChangeNotice"("recipientId", "acknowledgedAt");

-- AddForeignKey
ALTER TABLE "SokratesSubjectLock" ADD CONSTRAINT "SokratesSubjectLock_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "SokratesTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SokratesChangeNotice" ADD CONSTRAINT "SokratesChangeNotice_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "SokratesTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
