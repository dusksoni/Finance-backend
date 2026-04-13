DO $$
BEGIN
  CREATE TYPE "CollectionCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PROMISE_TO_PAY', 'BROKEN_PROMISE', 'RESOLVED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CollectionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CollectionActionType" AS ENUM ('CALL', 'VISIT', 'NOTICE', 'WHATSAPP', 'SMS', 'EMAIL', 'PROMISE_TO_PAY', 'SETTLEMENT_DISCUSSION', 'FOLLOW_UP', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CollectionCase" (
  "id" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "branchId" TEXT,
  "status" "CollectionCaseStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "CollectionPriority" NOT NULL DEFAULT 'MEDIUM',
  "bucket" TEXT NOT NULL,
  "dpd" INTEGER NOT NULL DEFAULT 0,
  "overdueEmiCount" INTEGER NOT NULL DEFAULT 0,
  "overdueAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "overdueFineAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "oldestDueDate" TIMESTAMP(3),
  "nextActionAt" TIMESTAMP(3),
  "lastContactAt" TIMESTAMP(3),
  "latestPromiseDate" TIMESTAMP(3),
  "latestPromiseAmount" DECIMAL(65,30),
  "resolutionType" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "assignedToEmployeeId" TEXT,
  "createdByAdminId" TEXT,
  "createdByEmployeeId" TEXT,
  "assignedByAdminId" TEXT,
  "assignedByEmployeeId" TEXT,
  "closedByAdminId" TEXT,
  "closedByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollectionCase_status_priority_idx" ON "CollectionCase"("status", "priority");
CREATE INDEX IF NOT EXISTS "CollectionCase_assignedToEmployeeId_status_idx" ON "CollectionCase"("assignedToEmployeeId", "status");
CREATE INDEX IF NOT EXISTS "CollectionCase_loanId_status_idx" ON "CollectionCase"("loanId", "status");
CREATE INDEX IF NOT EXISTS "CollectionCase_bucket_idx" ON "CollectionCase"("bucket");

ALTER TABLE "CollectionCase"
  ADD CONSTRAINT "CollectionCase_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionCase"
  ADD CONSTRAINT "CollectionCase_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionCase"
  ADD CONSTRAINT "CollectionCase_assignedToEmployeeId_fkey"
  FOREIGN KEY ("assignedToEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionCase"
  ADD CONSTRAINT "CollectionCase_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionCase"
  ADD CONSTRAINT "CollectionCase_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionCase"
  ADD CONSTRAINT "CollectionCase_assignedByAdminId_fkey"
  FOREIGN KEY ("assignedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionCase"
  ADD CONSTRAINT "CollectionCase_assignedByEmployeeId_fkey"
  FOREIGN KEY ("assignedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionCase"
  ADD CONSTRAINT "CollectionCase_closedByAdminId_fkey"
  FOREIGN KEY ("closedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionCase"
  ADD CONSTRAINT "CollectionCase_closedByEmployeeId_fkey"
  FOREIGN KEY ("closedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "CollectionAction" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "actionType" "CollectionActionType" NOT NULL,
  "outcome" TEXT,
  "notes" TEXT,
  "contactAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextActionAt" TIMESTAMP(3),
  "promiseDate" TIMESTAMP(3),
  "promiseAmount" DECIMAL(65,30),
  "metadata" JSONB,
  "createdByAdminId" TEXT,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollectionAction_caseId_contactAt_idx" ON "CollectionAction"("caseId", "contactAt");

ALTER TABLE "CollectionAction"
  ADD CONSTRAINT "CollectionAction_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "CollectionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionAction"
  ADD CONSTRAINT "CollectionAction_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionAction"
  ADD CONSTRAINT "CollectionAction_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
