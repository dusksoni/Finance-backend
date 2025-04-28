/*
  Warnings:

  - Added the required column `endDate` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenureMonths` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `chassisNumber` to the `TwoWheelerLoan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `engineNumber` to the `TwoWheelerLoan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AgricultureLoan" ADD COLUMN     "isSeasonal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usageArea" TEXT;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "actualEndDate" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "defaultReason" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "isDefaulted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tenureMonths" INTEGER NOT NULL,
ADD COLUMN     "totalDelayDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "delayDays" INTEGER,
ADD COLUMN     "fineAmount" DOUBLE PRECISION,
ADD COLUMN     "isDelayed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TwoWheelerLoan" ADD COLUMN     "chassisNumber" TEXT NOT NULL,
ADD COLUMN     "engineNumber" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "MSMELoan" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "monthlyRevenue" DOUBLE PRECISION NOT NULL,
    "gstNumber" TEXT,

    CONSTRAINT "MSMELoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MSMELoan_loanId_key" ON "MSMELoan"("loanId");

-- AddForeignKey
ALTER TABLE "MSMELoan" ADD CONSTRAINT "MSMELoan_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
