-- CreateTable
CREATE TABLE "FinalGrade" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "semester" TEXT NOT NULL,
    "grade" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalGrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinalGrade_studentId_idx" ON "FinalGrade"("studentId");

-- CreateIndex
CREATE INDEX "FinalGrade_classId_idx" ON "FinalGrade"("classId");

-- CreateIndex
CREATE INDEX "FinalGrade_semester_idx" ON "FinalGrade"("semester");

-- CreateIndex
CREATE UNIQUE INDEX "FinalGrade_studentId_classId_semester_key" ON "FinalGrade"("studentId", "classId", "semester");

-- AddForeignKey
ALTER TABLE "FinalGrade" ADD CONSTRAINT "FinalGrade_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalGrade" ADD CONSTRAINT "FinalGrade_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
