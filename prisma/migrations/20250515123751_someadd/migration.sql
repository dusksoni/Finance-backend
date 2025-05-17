/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `AddressCategory` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AddressCategory_name_key" ON "AddressCategory"("name");
