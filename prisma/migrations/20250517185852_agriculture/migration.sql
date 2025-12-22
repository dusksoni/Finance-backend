-- DropForeignKey
ALTER TABLE "AgricultureLoan" DROP CONSTRAINT "AgricultureLoan_usageAreaId_fkey";

-- AlterTable
ALTER TABLE "AgricultureLoan" ALTER COLUMN "usageAreaId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "AgricultureLoan" ADD CONSTRAINT "AgricultureLoan_usageAreaId_fkey" FOREIGN KEY ("usageAreaId") REFERENCES "UsageArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
