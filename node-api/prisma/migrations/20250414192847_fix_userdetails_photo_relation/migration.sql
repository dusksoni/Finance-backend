/*
  Warnings:

  - You are about to drop the column `photoIdTypeImage` on the `UserDetails` table. All the data in the column will be lost.
  - You are about to drop the column `photoUrl` on the `UserDetails` table. All the data in the column will be lost.
  - You are about to drop the column `proofOfIncomeImage` on the `UserDetails` table. All the data in the column will be lost.
  - Added the required column `country` to the `UserDetails` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "LoanType" ADD VALUE 'MSME';

-- AlterTable
ALTER TABLE "UserDetails" DROP COLUMN "photoIdTypeImage",
DROP COLUMN "photoUrl",
DROP COLUMN "proofOfIncomeImage",
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT NOT NULL,
ADD COLUMN     "photoId" TEXT;

-- CreateTable
CREATE TABLE "_PhotoIdTypeImages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PhotoIdTypeImages_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ProofOfIncomeImages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProofOfIncomeImages_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PhotoIdTypeImages_B_index" ON "_PhotoIdTypeImages"("B");

-- CreateIndex
CREATE INDEX "_ProofOfIncomeImages_B_index" ON "_ProofOfIncomeImages"("B");

-- AddForeignKey
ALTER TABLE "UserDetails" ADD CONSTRAINT "UserDetails_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PhotoIdTypeImages" ADD CONSTRAINT "_PhotoIdTypeImages_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PhotoIdTypeImages" ADD CONSTRAINT "_PhotoIdTypeImages_B_fkey" FOREIGN KEY ("B") REFERENCES "UserDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProofOfIncomeImages" ADD CONSTRAINT "_ProofOfIncomeImages_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProofOfIncomeImages" ADD CONSTRAINT "_ProofOfIncomeImages_B_fkey" FOREIGN KEY ("B") REFERENCES "UserDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
