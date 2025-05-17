/*
  Warnings:

  - Added the required column `value` to the `RelationType` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Gender" ALTER COLUMN "value" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "RelationType" ADD COLUMN     "value" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "State" ALTER COLUMN "stateCode" SET DEFAULT '00',
ALTER COLUMN "stateCode" SET DATA TYPE TEXT;
