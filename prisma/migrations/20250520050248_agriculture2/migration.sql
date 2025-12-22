/*
  Warnings:

  - You are about to drop the column `actualEndDate` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `agrementDate` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `disbirstedDate` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `loanAmount` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `totalPayableAmount` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `mode` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `paidOn` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `verifiedById` on the `Payment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name,regionId]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[chassisNumber]` on the table `TwoWheelerLoan` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `interestAmount` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `principalLoanAmount` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAmount` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentMode` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMode" ADD VALUE 'CHEQUE';
ALTER TYPE "PaymentMode" ADD VALUE 'UPI';

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_verifiedById_fkey";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "email" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "pincode" INTEGER;

-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "actualEndDate",
DROP COLUMN "agrementDate",
DROP COLUMN "amount",
DROP COLUMN "disbirstedDate",
DROP COLUMN "loanAmount",
DROP COLUMN "totalPayableAmount",
ADD COLUMN     "agreementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "disbursedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "interestAmount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "principalLoanAmount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "productAmount" DOUBLE PRECISION,
ADD COLUMN     "totalAmount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "totalPaidFine" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalPaidInterest" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalPaidPrincipal" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "amount",
DROP COLUMN "mode",
DROP COLUMN "paidOn",
DROP COLUMN "verifiedById",
ADD COLUMN     "finePaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "interestPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "isForeclosure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "paymentMode" TEXT NOT NULL,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "principalPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "totalPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedByAdminId" TEXT,
ADD COLUMN     "verifiedByEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "TwoWheelerLoan" ALTER COLUMN "rcNumber" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_regionId_key" ON "Branch"("name", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "TwoWheelerLoan_chassisNumber_key" ON "TwoWheelerLoan"("chassisNumber");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedByAdminId_fkey" FOREIGN KEY ("verifiedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedByEmployeeId_fkey" FOREIGN KEY ("verifiedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
