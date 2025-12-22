-- AlterTable User: Add permanent address fields
ALTER TABLE "User" ADD COLUMN "permanentAddress" TEXT,
ADD COLUMN "permanentCountry" TEXT,
ADD COLUMN "permanentPincode" INTEGER,
ADD COLUMN "permanentStateId" TEXT,
ADD COLUMN "permanentCityId" TEXT;

-- AlterTable User: Add temporary address fields
ALTER TABLE "User" ADD COLUMN "temporaryAddress" TEXT,
ADD COLUMN "temporaryCountry" TEXT,
ADD COLUMN "temporaryPincode" INTEGER,
ADD COLUMN "temporaryStateId" TEXT,
ADD COLUMN "temporaryCityId" TEXT;

-- AlterTable AgricultureLoan: Add registration number
ALTER TABLE "AgricultureLoan" ADD COLUMN "registrationNumber" TEXT;

-- AlterTable Loan: Drop deprecated fields
-- Note: These fields contained data in 7 loans, but are no longer needed as per business requirements
ALTER TABLE "Loan" DROP COLUMN IF EXISTS "productAmount",
DROP COLUMN IF EXISTS "downPayment",
DROP COLUMN IF EXISTS "ourPaymentType";

-- AddForeignKey for permanent state
ALTER TABLE "User" ADD CONSTRAINT "User_permanentStateId_fkey" FOREIGN KEY ("permanentStateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey for permanent city
ALTER TABLE "User" ADD CONSTRAINT "User_permanentCityId_fkey" FOREIGN KEY ("permanentCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey for temporary state
ALTER TABLE "User" ADD CONSTRAINT "User_temporaryStateId_fkey" FOREIGN KEY ("temporaryStateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey for temporary city
ALTER TABLE "User" ADD CONSTRAINT "User_temporaryCityId_fkey" FOREIGN KEY ("temporaryCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
