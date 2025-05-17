/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `RelationType` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "RelationType" ALTER COLUMN "value" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RelationType_name_key" ON "RelationType"("name");
