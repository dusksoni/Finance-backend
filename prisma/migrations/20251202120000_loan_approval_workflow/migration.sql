-- AlterTable
ALTER TABLE "Loan"
  ADD COLUMN     "approvalComment" TEXT,
  ADD COLUMN     "approvedAt" TIMESTAMP(3),
  ADD COLUMN     "approvedByAdminId" TEXT,
  ADD COLUMN     "approvedByEmployeeId" TEXT;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_approvedByAdminId_fkey" FOREIGN KEY ("approvedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_approvedByEmployeeId_fkey" FOREIGN KEY ("approvedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
