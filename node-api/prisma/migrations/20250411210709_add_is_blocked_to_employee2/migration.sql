/*
  Warnings:

  - You are about to drop the column `isBlockted` on the `Employee` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "isBlockted",
ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false;
