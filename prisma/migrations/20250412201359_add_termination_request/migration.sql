-- CreateTable
CREATE TABLE "TerminationRequest" (
    "id" TEXT NOT NULL,
    "regnNo" TEXT NOT NULL,
    "chassisNo" TEXT NOT NULL,
    "terminationDt" TIMESTAMP(3) NOT NULL,
    "docUrl" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "response" JSONB,
    "status" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "adminId" TEXT,
    "employeeId" TEXT,

    CONSTRAINT "TerminationRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TerminationRequest" ADD CONSTRAINT "TerminationRequest_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminationRequest" ADD CONSTRAINT "TerminationRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
