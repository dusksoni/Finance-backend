/*
  Warnings:

  - You are about to drop the column `ceaseAddress` on the `CeaseHistory` table. All the data in the column will be lost.
  - You are about to drop the column `ceaseLat` on the `CeaseHistory` table. All the data in the column will be lost.
  - You are about to drop the column `ceaseLng` on the `CeaseHistory` table. All the data in the column will be lost.
  - You are about to drop the column `address` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `addressCategoryId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `cityId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `cityText` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `permanentAddress` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `permanentCityId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `permanentCountry` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `permanentPincode` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `permanentStateId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `pincode` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `stateId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `temporaryAddress` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `temporaryCityId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `temporaryCountry` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `temporaryPincode` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `temporaryStateId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `_CeaseFiles` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_addressCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_cityId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_permanentCityId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_permanentStateId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_stateId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_temporaryCityId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_temporaryStateId_fkey";

-- DropForeignKey
ALTER TABLE "_CeaseFiles" DROP CONSTRAINT "_CeaseFiles_A_fkey";

-- DropForeignKey
ALTER TABLE "_CeaseFiles" DROP CONSTRAINT "_CeaseFiles_B_fkey";

-- DropForeignKey
ALTER TABLE "_ReleaseFiles" DROP CONSTRAINT "_ReleaseFiles_A_fkey";

-- DropForeignKey
ALTER TABLE "_ReleaseFiles" DROP CONSTRAINT "_ReleaseFiles_B_fkey";

-- AlterTable
ALTER TABLE "CeaseHistory" DROP COLUMN "ceaseAddress",
DROP COLUMN "ceaseLat",
DROP COLUMN "ceaseLng",
ADD COLUMN     "seizedAddress" TEXT,
ADD COLUMN     "seizedLat" DOUBLE PRECISION,
ADD COLUMN     "seizedLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "UserAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addressCategoryId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "pincode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

-- Migrate existing address data to UserAddress table
-- Get "Permanent" and "Official" address category IDs
DO $$
DECLARE
    permanent_category_id TEXT;
    official_category_id TEXT;
    default_state_id TEXT;
    default_city_id TEXT;
BEGIN
    SELECT id INTO permanent_category_id FROM "AddressCategory" WHERE name = 'Permanent' LIMIT 1;
    SELECT id INTO official_category_id FROM "AddressCategory" WHERE name = 'Official' LIMIT 1;
    SELECT id INTO default_state_id FROM "State" LIMIT 1;
    SELECT id INTO default_city_id FROM "City" LIMIT 1;

    -- Skip if no address categories exist
    IF permanent_category_id IS NULL OR official_category_id IS NULL THEN
        RETURN;
    END IF;

    -- Migrate permanent addresses
    INSERT INTO "UserAddress" ("id", "userId", "addressCategoryId", "address", "country", "stateId", "cityId", "pincode", "createdAt", "updatedAt")
    SELECT
        gen_random_uuid(),
        "id",
        permanent_category_id,
        COALESCE("permanentAddress", ''),
        COALESCE("permanentCountry", ''),
        COALESCE("permanentStateId", default_state_id),
        COALESCE("permanentCityId", default_city_id),
        COALESCE("permanentPincode", 0),
        NOW(),
        NOW()
    FROM "User"
    WHERE "permanentAddress" IS NOT NULL
      AND "permanentAddress" != ''
      AND "permanentStateId" IS NOT NULL
      AND "permanentCityId" IS NOT NULL;

    -- Migrate official/temporary addresses (using official category)
    INSERT INTO "UserAddress" ("id", "userId", "addressCategoryId", "address", "country", "stateId", "cityId", "pincode", "createdAt", "updatedAt")
    SELECT
        gen_random_uuid(),
        "id",
        official_category_id,
        COALESCE("temporaryAddress", ''),
        COALESCE("temporaryCountry", ''),
        COALESCE("temporaryStateId", default_state_id),
        COALESCE("temporaryCityId", default_city_id),
        COALESCE("temporaryPincode", 0),
        NOW(),
        NOW()
    FROM "User"
    WHERE "temporaryAddress" IS NOT NULL
      AND "temporaryAddress" != ''
      AND "temporaryStateId" IS NOT NULL
      AND "temporaryCityId" IS NOT NULL;
END $$;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "address",
DROP COLUMN "addressCategoryId",
DROP COLUMN "cityId",
DROP COLUMN "cityText",
DROP COLUMN "country",
DROP COLUMN "permanentAddress",
DROP COLUMN "permanentCityId",
DROP COLUMN "permanentCountry",
DROP COLUMN "permanentPincode",
DROP COLUMN "permanentStateId",
DROP COLUMN "pincode",
DROP COLUMN "stateId",
DROP COLUMN "temporaryAddress",
DROP COLUMN "temporaryCityId",
DROP COLUMN "temporaryCountry",
DROP COLUMN "temporaryPincode",
DROP COLUMN "temporaryStateId";

-- DropTable
DROP TABLE "_CeaseFiles";

-- CreateTable
CREATE TABLE "_SeizedFiles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SeizedFiles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_SeizedFiles_B_index" ON "_SeizedFiles"("B");

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_addressCategoryId_fkey" FOREIGN KEY ("addressCategoryId") REFERENCES "AddressCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SeizedFiles" ADD CONSTRAINT "_SeizedFiles_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SeizedFiles" ADD CONSTRAINT "_SeizedFiles_B_fkey" FOREIGN KEY ("B") REFERENCES "CeaseHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReleaseFiles" ADD CONSTRAINT "_ReleaseFiles_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReleaseFiles" ADD CONSTRAINT "_ReleaseFiles_B_fkey" FOREIGN KEY ("B") REFERENCES "CeaseHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
