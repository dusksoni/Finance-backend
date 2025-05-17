/*
  Warnings:

  - You are about to drop the column `name` on the `User` table. All the data in the column will be lost.
  - Added the required column `loanAmount` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monthlyPayableAmount` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `penaltyPercentage` to the `Loan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "agrementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "comment" TEXT,
ADD COLUMN     "disbirstedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "downPayment" DOUBLE PRECISION,
ADD COLUMN     "insuranceAlert" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "insuranceAmount" DOUBLE PRECISION,
ADD COLUMN     "insuranceCompany" TEXT,
ADD COLUMN     "insuranceDate" TIMESTAMP(3),
ADD COLUMN     "insuranceNumber" TEXT,
ADD COLUMN     "insuranceValidTill" TIMESTAMP(3),
ADD COLUMN     "loanAmount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "monthlyPayableAmount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "otherCharges" DOUBLE PRECISION,
ADD COLUMN     "ourPaymentType" TEXT,
ADD COLUMN     "penaltyPercentage" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "processingCharges" DOUBLE PRECISION,
ADD COLUMN     "rtoCharges" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "State" ADD COLUMN     "stateCode" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "name",
ADD COLUMN     "addressCategoryId" TEXT,
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "failedGuarantees" INTEGER,
ADD COLUMN     "firstName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "genderId" TEXT,
ADD COLUMN     "guarantorReputationScore" INTEGER,
ADD COLUMN     "lastName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "maritalStatus" TEXT DEFAULT '',
ADD COLUMN     "middleName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "qualification" TEXT,
ADD COLUMN     "relationFirstName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "relationLastName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "relationMiddleName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "relationTypeId" TEXT,
ADD COLUMN     "successfulGuarantees" INTEGER,
ADD COLUMN     "totalGuaranteedLoans" INTEGER;

-- CreateTable
CREATE TABLE "UserUpdateRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "loginActivityId" TEXT,
    "requestedByAdminId" TEXT,
    "requestedByEmployeeId" TEXT,

    CONSTRAINT "UserUpdateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gender" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanGuarantor" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "guarantorId" TEXT NOT NULL,
    "performanceScore" DOUBLE PRECISION,
    "isFlagged" BOOLEAN DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanGuarantor_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_addressCategoryId_fkey" FOREIGN KEY ("addressCategoryId") REFERENCES "AddressCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_relationTypeId_fkey" FOREIGN KEY ("relationTypeId") REFERENCES "RelationType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_genderId_fkey" FOREIGN KEY ("genderId") REFERENCES "Gender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUpdateRequest" ADD CONSTRAINT "UserUpdateRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUpdateRequest" ADD CONSTRAINT "UserUpdateRequest_loginActivityId_fkey" FOREIGN KEY ("loginActivityId") REFERENCES "LoginActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUpdateRequest" ADD CONSTRAINT "UserUpdateRequest_requestedByAdminId_fkey" FOREIGN KEY ("requestedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUpdateRequest" ADD CONSTRAINT "UserUpdateRequest_requestedByEmployeeId_fkey" FOREIGN KEY ("requestedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanGuarantor" ADD CONSTRAINT "LoanGuarantor_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanGuarantor" ADD CONSTRAINT "LoanGuarantor_guarantorId_fkey" FOREIGN KEY ("guarantorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
