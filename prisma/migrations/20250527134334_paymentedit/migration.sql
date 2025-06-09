/*
  Warnings:

  - You are about to drop the column `interestPaid` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `principalPaid` on the `Payment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "interestPaid",
DROP COLUMN "principalPaid",
ADD COLUMN     "amountPaidSoFar" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "emiPayAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "interestAmt" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "principalAmt" DECIMAL(65,30) NOT NULL DEFAULT 0;
