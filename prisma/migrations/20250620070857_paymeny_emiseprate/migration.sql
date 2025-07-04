/*
  Warnings:

  - You are about to drop the column `amountPaidSoFar` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `delayDays` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `emiPayAmount` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `fineAmount` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `finePaid` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `interestAmt` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `interestPaid` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `isDelayed` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `isForeclosure` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `paymentFor` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `paymentStatus` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `principalAmt` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `principalPaid` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `totalPaid` on the `Payment` table. All the data in the column will be lost.
  - The `paymentMode` column on the `Payment` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_loanId_fkey";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "amountPaidSoFar",
DROP COLUMN "delayDays",
DROP COLUMN "emiPayAmount",
DROP COLUMN "fineAmount",
DROP COLUMN "finePaid",
DROP COLUMN "interestAmt",
DROP COLUMN "interestPaid",
DROP COLUMN "isDelayed",
DROP COLUMN "isForeclosure",
DROP COLUMN "paymentFor",
DROP COLUMN "paymentStatus",
DROP COLUMN "principalAmt",
DROP COLUMN "principalPaid",
DROP COLUMN "totalPaid",
ADD COLUMN     "adminId" TEXT,
ADD COLUMN     "amount" DECIMAL(65,30) DEFAULT 0,
ADD COLUMN     "emiId" TEXT,
ADD COLUMN     "employeeId" TEXT,
DROP COLUMN "paymentMode",
ADD COLUMN     "paymentMode" "PaymentMode",
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "EMI" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "paymentFor" TIMESTAMP(3) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emiPayAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "principalAmt" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "interestAmt" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amountPaidSoFar" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "finePaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "principalPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "interestPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "isForeclosure" BOOLEAN NOT NULL DEFAULT false,
    "isDelayed" BOOLEAN NOT NULL DEFAULT false,
    "delayDays" INTEGER,
    "fineAmount" DOUBLE PRECISION,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByAdminId" TEXT,
    "verifiedByEmployeeId" TEXT,

    CONSTRAINT "EMI_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EMI" ADD CONSTRAINT "EMI_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_emiId_fkey" FOREIGN KEY ("emiId") REFERENCES "EMI"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
