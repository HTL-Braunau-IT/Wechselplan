-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_classHeadId_fkey" FOREIGN KEY ("classHeadId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_classLeadId_fkey" FOREIGN KEY ("classLeadId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
