/*
  Warnings:

  - You are about to drop the column `city` on the `Region` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `Region` table. All the data in the column will be lost.
  - You are about to drop the column `cityId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `regionId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `stateId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `UserDetails` table. All the data in the column will be lost.
  - Added the required column `cityId` to the `Region` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stateId` to the `Region` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_cityId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_regionId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_stateId_fkey";

-- DropIndex
DROP INDEX "Region_name_key";

-- AlterTable
ALTER TABLE "Region" DROP COLUMN "city",
DROP COLUMN "state",
ADD COLUMN     "cityId" TEXT NOT NULL,
ADD COLUMN     "stateId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "cityId",
DROP COLUMN "regionId",
DROP COLUMN "stateId";

-- AlterTable
ALTER TABLE "UserDetails" DROP COLUMN "city",
ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "cityText" TEXT,
ADD COLUMN     "regionId" TEXT,
ADD COLUMN     "stateId" TEXT;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDetails" ADD CONSTRAINT "UserDetails_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDetails" ADD CONSTRAINT "UserDetails_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDetails" ADD CONSTRAINT "UserDetails_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;
