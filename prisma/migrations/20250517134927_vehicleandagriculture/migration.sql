/*
  Warnings:

  - You are about to drop the column `equipment` on the `AgricultureLoan` table. All the data in the column will be lost.
  - You are about to drop the column `usageArea` on the `AgricultureLoan` table. All the data in the column will be lost.
  - You are about to drop the column `brand` on the `TwoWheelerLoan` table. All the data in the column will be lost.
  - You are about to drop the column `model` on the `TwoWheelerLoan` table. All the data in the column will be lost.
  - You are about to drop the column `variant` on the `TwoWheelerLoan` table. All the data in the column will be lost.
  - You are about to drop the column `branchId` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[fileNo]` on the table `Loan` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `equipmentId` to the `AgricultureLoan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `usageAreaId` to the `AgricultureLoan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileNo` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `brandId` to the `TwoWheelerLoan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `modelId` to the `TwoWheelerLoan` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('INITIATED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'APPROVED', 'DISBURSED', 'ACTIVE', 'OVERDUE', 'DEFAULTED', 'CEASED', 'RELEASED', 'CLOSED', 'REJECTED', 'CANCELLED', 'LEGAL_ACTION', 'WRITTEN_OFF', 'UNDER_COLLECTION');

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_branchId_fkey";

-- AlterTable
ALTER TABLE "AgricultureLoan" DROP COLUMN "equipment",
DROP COLUMN "usageArea",
ADD COLUMN     "equipmentId" TEXT NOT NULL,
ADD COLUMN     "usageAreaId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "fileNo" TEXT NOT NULL,
ADD COLUMN     "fileStatus" "FileStatus" NOT NULL DEFAULT 'INITIATED';

-- AlterTable
ALTER TABLE "TwoWheelerLoan" DROP COLUMN "brand",
DROP COLUMN "model",
DROP COLUMN "variant",
ADD COLUMN     "brandId" TEXT NOT NULL,
ADD COLUMN     "modelId" TEXT NOT NULL,
ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "branchId";

-- CreateTable
CREATE TABLE "CeaseHistory" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedToId" TEXT,
    "ceasedById" TEXT,
    "ceaseDate" TIMESTAMP(3),
    "location" TEXT,
    "comment" TEXT,
    "releaseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeaseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleBrand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VehicleBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,

    CONSTRAINT "VehicleModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleVariant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,

    CONSTRAINT "VehicleVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "UsageArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleBrand_name_key" ON "VehicleBrand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_name_key" ON "Equipment"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UsageArea_name_key" ON "UsageArea"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_fileNo_key" ON "Loan"("fileNo");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeaseHistory" ADD CONSTRAINT "CeaseHistory_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeaseHistory" ADD CONSTRAINT "CeaseHistory_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeaseHistory" ADD CONSTRAINT "CeaseHistory_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeaseHistory" ADD CONSTRAINT "CeaseHistory_ceasedById_fkey" FOREIGN KEY ("ceasedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoWheelerLoan" ADD CONSTRAINT "TwoWheelerLoan_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "VehicleBrand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoWheelerLoan" ADD CONSTRAINT "TwoWheelerLoan_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VehicleModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoWheelerLoan" ADD CONSTRAINT "TwoWheelerLoan_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "VehicleVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleModel" ADD CONSTRAINT "VehicleModel_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "VehicleBrand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleVariant" ADD CONSTRAINT "VehicleVariant_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VehicleModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgricultureLoan" ADD CONSTRAINT "AgricultureLoan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgricultureLoan" ADD CONSTRAINT "AgricultureLoan_usageAreaId_fkey" FOREIGN KEY ("usageAreaId") REFERENCES "UsageArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
