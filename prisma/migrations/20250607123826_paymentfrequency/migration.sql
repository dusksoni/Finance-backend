-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "paymentFrequency" TEXT NOT NULL DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "TwoWheelerLoan" ALTER COLUMN "vehicleName" DROP NOT NULL;
