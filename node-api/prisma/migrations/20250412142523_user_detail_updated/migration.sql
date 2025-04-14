/*
  Warnings:

  - You are about to drop the column `aadhaar` on the `UserDetails` table. All the data in the column will be lost.
  - You are about to drop the column `pan` on the `UserDetails` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[photoIdNumber]` on the table `UserDetails` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `photoIdNumber` to the `UserDetails` table without a default value. This is not possible if the table is not empty.
  - Added the required column `photoIdTypeId` to the `UserDetails` table without a default value. This is not possible if the table is not empty.
  - Added the required column `profession` to the `UserDetails` table without a default value. This is not possible if the table is not empty.
  - Added the required column `proofOfIncome` to the `UserDetails` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "UserDetails_aadhaar_key";

-- DropIndex
DROP INDEX "UserDetails_pan_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isDefaulter" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserDetails" DROP COLUMN "aadhaar",
DROP COLUMN "pan",
ADD COLUMN     "creditScore" INTEGER,
ADD COLUMN     "photoIdNumber" TEXT NOT NULL,
ADD COLUMN     "photoIdTypeId" TEXT NOT NULL,
ADD COLUMN     "photoIdTypeImage" TEXT[],
ADD COLUMN     "profession" TEXT NOT NULL,
ADD COLUMN     "proofOfIncome" TEXT NOT NULL,
ADD COLUMN     "proofOfIncomeImage" TEXT[];

-- CreateTable
CREATE TABLE "PhotoIdType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "PhotoIdType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoIdType_name_key" ON "PhotoIdType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserDetails_photoIdNumber_key" ON "UserDetails"("photoIdNumber");

-- AddForeignKey
ALTER TABLE "UserDetails" ADD CONSTRAINT "UserDetails_photoIdTypeId_fkey" FOREIGN KEY ("photoIdTypeId") REFERENCES "PhotoIdType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
