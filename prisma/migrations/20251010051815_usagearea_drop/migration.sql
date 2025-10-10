/*
  Warnings:

  - You are about to drop the column `usageAreaId` on the `AgricultureLoan` table. All the data in the column will be lost.
  - You are about to drop the `UsageArea` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AgricultureLoan" DROP CONSTRAINT "AgricultureLoan_usageAreaId_fkey";

-- AlterTable
ALTER TABLE "AgricultureLoan" DROP COLUMN "usageAreaId",
ADD COLUMN     "usageArea" TEXT;

-- DropTable
DROP TABLE "UsageArea";
