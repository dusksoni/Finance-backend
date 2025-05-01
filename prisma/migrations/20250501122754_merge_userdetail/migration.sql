/*
  Warnings:

  - You are about to drop the column `otp` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `UserDetails` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_PhotoIdTypeImages` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `mode` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('ONLINE', 'CASH');

-- DropForeignKey
ALTER TABLE "UserDetails" DROP CONSTRAINT "UserDetails_cityId_fkey";

-- DropForeignKey
ALTER TABLE "UserDetails" DROP CONSTRAINT "UserDetails_photoIdTypeId_fkey";

-- DropForeignKey
ALTER TABLE "UserDetails" DROP CONSTRAINT "UserDetails_photoId_fkey";

-- DropForeignKey
ALTER TABLE "UserDetails" DROP CONSTRAINT "UserDetails_regionId_fkey";

-- DropForeignKey
ALTER TABLE "UserDetails" DROP CONSTRAINT "UserDetails_stateId_fkey";

-- DropForeignKey
ALTER TABLE "UserDetails" DROP CONSTRAINT "UserDetails_userId_fkey";

-- DropForeignKey
ALTER TABLE "_PhotoIdTypeImages" DROP CONSTRAINT "_PhotoIdTypeImages_A_fkey";

-- DropForeignKey
ALTER TABLE "_PhotoIdTypeImages" DROP CONSTRAINT "_PhotoIdTypeImages_B_fkey";

-- DropForeignKey
ALTER TABLE "_ProofOfIncomeImages" DROP CONSTRAINT "_ProofOfIncomeImages_B_fkey";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "mode" "PaymentMode" NOT NULL,
ADD COLUMN     "transactionId" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedById" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "otp",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "cityText" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "creditScore" INTEGER,
ADD COLUMN     "photoId" TEXT,
ADD COLUMN     "profession" TEXT,
ADD COLUMN     "proofOfIncome" TEXT,
ADD COLUMN     "regionId" TEXT,
ADD COLUMN     "stateId" TEXT;

-- DropTable
DROP TABLE "UserDetails";

-- DropTable
DROP TABLE "_PhotoIdTypeImages";

-- CreateTable
CREATE TABLE "PhotoID" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "photoIdTypeId" TEXT NOT NULL,
    "photoIdNumber" TEXT NOT NULL,

    CONSTRAINT "PhotoID_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PhotoIDImages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PhotoIDImages_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoID_photoIdNumber_key" ON "PhotoID"("photoIdNumber");

-- CreateIndex
CREATE INDEX "_PhotoIDImages_B_index" ON "_PhotoIDImages"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoID" ADD CONSTRAINT "PhotoID_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoID" ADD CONSTRAINT "PhotoID_photoIdTypeId_fkey" FOREIGN KEY ("photoIdTypeId") REFERENCES "PhotoIdType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProofOfIncomeImages" ADD CONSTRAINT "_ProofOfIncomeImages_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PhotoIDImages" ADD CONSTRAINT "_PhotoIDImages_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PhotoIDImages" ADD CONSTRAINT "_PhotoIDImages_B_fkey" FOREIGN KEY ("B") REFERENCES "PhotoID"("id") ON DELETE CASCADE ON UPDATE CASCADE;
