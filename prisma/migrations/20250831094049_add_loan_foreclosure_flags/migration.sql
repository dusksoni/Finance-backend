-- AlterEnum
ALTER TYPE "FileStatus" ADD VALUE 'FORECLOSED';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "foreclosedAt" TIMESTAMP(3),
ADD COLUMN     "isForeclosed" BOOLEAN NOT NULL DEFAULT false;
