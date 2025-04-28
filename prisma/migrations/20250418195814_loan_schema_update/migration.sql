/*
  Warnings:

  - You are about to drop the column `type` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `dealerName` on the `TwoWheelerLoan` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleType` on the `TwoWheelerLoan` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[registrationNumber]` on the table `MSMELoan` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[registrationNumber]` on the table `TwoWheelerLoan` will be added. If there are existing duplicate values, this will fail.
  - Made the column `usageArea` on table `AgricultureLoan` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `loanTypeId` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rcNumber` to the `TwoWheelerLoan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicleName` to the `TwoWheelerLoan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AgricultureLoan" ALTER COLUMN "usageArea" SET NOT NULL;

-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "type",
ADD COLUMN     "loanTypeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TwoWheelerLoan" DROP COLUMN "dealerName",
DROP COLUMN "vehicleType",
ADD COLUMN     "rcNumber" TEXT NOT NULL,
ADD COLUMN     "variant" TEXT,
ADD COLUMN     "vehicleName" TEXT NOT NULL;

-- DropEnum
DROP TYPE "LoanType";

-- CreateTable
CREATE TABLE "LoanType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB,

    CONSTRAINT "LoanType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanType_name_key" ON "LoanType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MSMELoan_registrationNumber_key" ON "MSMELoan"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TwoWheelerLoan_registrationNumber_key" ON "TwoWheelerLoan"("registrationNumber");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_loanTypeId_fkey" FOREIGN KEY ("loanTypeId") REFERENCES "LoanType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
