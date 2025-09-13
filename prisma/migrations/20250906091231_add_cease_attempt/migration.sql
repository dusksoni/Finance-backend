/*
  Warnings:

  - You are about to drop the column `customerContactAttempts` on the `CeaseHistory` table. All the data in the column will be lost.
  - You are about to drop the column `lastContactAttemptDate` on the `CeaseHistory` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `CeaseHistory` table. All the data in the column will be lost.
  - You are about to drop the column `recoveryAmount` on the `CeaseHistory` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('CALL', 'VISIT', 'WHATSAPP', 'SMS', 'OTHER');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('PICKED', 'UNREACHABLE', 'SWITCHED_OFF', 'BUSY', 'NO_ANSWER', 'WRONG_NUMBER', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "CeaseHistory" DROP COLUMN "customerContactAttempts",
DROP COLUMN "lastContactAttemptDate",
DROP COLUMN "location",
DROP COLUMN "recoveryAmount",
ADD COLUMN     "actualCeaseDate" TIMESTAMP(3),
ADD COLUMN     "ceaseAddress" TEXT,
ADD COLUMN     "ceaseLat" DOUBLE PRECISION,
ADD COLUMN     "ceaseLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "CeaseContactAttempt" (
    "id" TEXT NOT NULL,
    "ceaseHistoryId" TEXT NOT NULL,
    "contactAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactType" "ContactType" NOT NULL DEFAULT 'CALL',
    "callOutcome" "CallOutcome",
    "summary" TEXT,
    "spokeTo" TEXT,
    "phoneUsed" TEXT,
    "durationSeconds" INTEGER,
    "createdByAdminId" TEXT,
    "createdByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeaseContactAttempt_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CeaseContactAttempt" ADD CONSTRAINT "CeaseContactAttempt_ceaseHistoryId_fkey" FOREIGN KEY ("ceaseHistoryId") REFERENCES "CeaseHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeaseContactAttempt" ADD CONSTRAINT "CeaseContactAttempt_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeaseContactAttempt" ADD CONSTRAINT "CeaseContactAttempt_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
