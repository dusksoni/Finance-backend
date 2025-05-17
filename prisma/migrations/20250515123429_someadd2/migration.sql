/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Gender` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Gender" ALTER COLUMN "value" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Gender_name_key" ON "Gender"("name");
