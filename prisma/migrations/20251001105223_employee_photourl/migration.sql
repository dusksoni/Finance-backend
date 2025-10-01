-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "photoUrlId" TEXT;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_photoUrlId_fkey" FOREIGN KEY ("photoUrlId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
