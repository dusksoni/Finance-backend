/*
  Warnings:

  - You are about to drop the column `assignedById` on the `CeaseHistory` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "FileStatus" ADD VALUE 'FORECLOSURE_IN_PROGRESS';

-- DropForeignKey
ALTER TABLE "CeaseHistory" DROP CONSTRAINT "CeaseHistory_assignedById_fkey";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CeaseHistory" DROP COLUMN "assignedById",
ADD COLUMN     "assignedByAdminId" TEXT,
ADD COLUMN     "assignedByEmployeeId" TEXT,
ADD COLUMN     "releaseReason" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "TerminationRequest" ADD COLUMN     "twoWheelerLoanId" TEXT;

-- AlterTable
ALTER TABLE "TwoWheelerLoan" ADD COLUMN     "hypothecationTerminated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "_CeaseFiles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CeaseFiles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ReleaseFiles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ReleaseFiles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CeaseFiles_B_index" ON "_CeaseFiles"("B");

-- CreateIndex
CREATE INDEX "_ReleaseFiles_B_index" ON "_ReleaseFiles"("B");

-- AddForeignKey
ALTER TABLE "CeaseHistory" ADD CONSTRAINT "CeaseHistory_assignedByAdminId_fkey" FOREIGN KEY ("assignedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeaseHistory" ADD CONSTRAINT "CeaseHistory_assignedByEmployeeId_fkey" FOREIGN KEY ("assignedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminationRequest" ADD CONSTRAINT "TerminationRequest_twoWheelerLoanId_fkey" FOREIGN KEY ("twoWheelerLoanId") REFERENCES "TwoWheelerLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CeaseFiles" ADD CONSTRAINT "_CeaseFiles_A_fkey" FOREIGN KEY ("A") REFERENCES "CeaseHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CeaseFiles" ADD CONSTRAINT "_CeaseFiles_B_fkey" FOREIGN KEY ("B") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReleaseFiles" ADD CONSTRAINT "_ReleaseFiles_A_fkey" FOREIGN KEY ("A") REFERENCES "CeaseHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReleaseFiles" ADD CONSTRAINT "_ReleaseFiles_B_fkey" FOREIGN KEY ("B") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
