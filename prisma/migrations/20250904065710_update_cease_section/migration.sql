/*
  Warnings:

  - Added the required column `updatedAt` to the `CeaseHistory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CeaseHistory" ADD COLUMN     "assetCondition" TEXT,
ADD COLUMN     "customerContactAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "lastContactAttemptDate" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "recoveryAmount" DOUBLE PRECISION,
ADD COLUMN     "releasedByAdminId" TEXT,
ADD COLUMN     "releasedByEmployeeId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
