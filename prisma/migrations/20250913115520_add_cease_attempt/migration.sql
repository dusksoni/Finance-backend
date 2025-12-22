/*
  Warnings:

  - You are about to drop the column `phoneUsed` on the `CeaseContactAttempt` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "FileStatus" ADD VALUE 'CEASED_INITIATED';

-- AlterTable
ALTER TABLE "CeaseContactAttempt" DROP COLUMN "phoneUsed";
