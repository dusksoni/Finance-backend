-- AlterTable
ALTER TABLE "CeaseHistory" ADD COLUMN     "releaseNotes" TEXT;

-- AddForeignKey
ALTER TABLE "CeaseHistory" ADD CONSTRAINT "CeaseHistory_releasedByAdminId_fkey" FOREIGN KEY ("releasedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeaseHistory" ADD CONSTRAINT "CeaseHistory_releasedByEmployeeId_fkey" FOREIGN KEY ("releasedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
