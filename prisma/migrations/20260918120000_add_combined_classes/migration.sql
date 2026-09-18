-- AlterTable
ALTER TABLE "Class" ADD COLUMN "isCombined" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Class_isCombined_idx" ON "Class"("isCombined");

-- CreateTable
CREATE TABLE "CombinedClassMember" (
    "id" SERIAL NOT NULL,
    "combinedClassId" INTEGER NOT NULL,
    "memberClassId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CombinedClassMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CombinedClassMember_combinedClassId_idx" ON "CombinedClassMember"("combinedClassId");

-- CreateIndex
CREATE INDEX "CombinedClassMember_memberClassId_idx" ON "CombinedClassMember"("memberClassId");

-- CreateIndex
CREATE UNIQUE INDEX "CombinedClassMember_combinedClassId_memberClassId_key" ON "CombinedClassMember"("combinedClassId", "memberClassId");

-- AddForeignKey
ALTER TABLE "CombinedClassMember" ADD CONSTRAINT "CombinedClassMember_combinedClassId_fkey" FOREIGN KEY ("combinedClassId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombinedClassMember" ADD CONSTRAINT "CombinedClassMember_memberClassId_fkey" FOREIGN KEY ("memberClassId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
