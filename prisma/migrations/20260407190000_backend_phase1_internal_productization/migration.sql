DO $$
BEGIN
  CREATE TYPE "GrievanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "GrievancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "GrievanceSource" AS ENUM ('BRANCH', 'CALL_CENTER', 'EMAIL', 'WEB', 'APP', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AppConfig" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "value" JSONB NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "updatedByAdminId" TEXT,
  "updatedByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppConfig_key_key" ON "AppConfig"("key");

ALTER TABLE "AppConfig"
  ADD CONSTRAINT "AppConfig_updatedByAdminId_fkey"
  FOREIGN KEY ("updatedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppConfig"
  ADD CONSTRAINT "AppConfig_updatedByEmployeeId_fkey"
  FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PublicAccessSession" (
  "id" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "accessTokenHash" TEXT NOT NULL,
  "verificationMethod" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "context" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicAccessSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PublicAccessSession_accessTokenHash_key" ON "PublicAccessSession"("accessTokenHash");
CREATE INDEX IF NOT EXISTS "PublicAccessSession_loanId_status_idx" ON "PublicAccessSession"("loanId", "status");
CREATE INDEX IF NOT EXISTS "PublicAccessSession_expiresAt_idx" ON "PublicAccessSession"("expiresAt");

ALTER TABLE "PublicAccessSession"
  ADD CONSTRAINT "PublicAccessSession_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "GrievanceTicket" (
  "id" TEXT NOT NULL,
  "ticketNumber" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "GrievanceStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "GrievancePriority" NOT NULL DEFAULT 'MEDIUM',
  "source" "GrievanceSource" NOT NULL DEFAULT 'BRANCH',
  "metadata" JSONB,
  "dueAt" TIMESTAMP(3),
  "firstResponseAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolutionSummary" TEXT,
  "resolutionMetadata" JSONB,
  "userId" TEXT,
  "loanId" TEXT,
  "branchId" TEXT,
  "assignedToEmployeeId" TEXT,
  "createdByAdminId" TEXT,
  "createdByEmployeeId" TEXT,
  "assignedByAdminId" TEXT,
  "assignedByEmployeeId" TEXT,
  "resolvedByAdminId" TEXT,
  "resolvedByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrievanceTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GrievanceTicket_ticketNumber_key" ON "GrievanceTicket"("ticketNumber");
CREATE INDEX IF NOT EXISTS "GrievanceTicket_status_priority_idx" ON "GrievanceTicket"("status", "priority");
CREATE INDEX IF NOT EXISTS "GrievanceTicket_assignedToEmployeeId_status_idx" ON "GrievanceTicket"("assignedToEmployeeId", "status");
CREATE INDEX IF NOT EXISTS "GrievanceTicket_loanId_idx" ON "GrievanceTicket"("loanId");
CREATE INDEX IF NOT EXISTS "GrievanceTicket_userId_idx" ON "GrievanceTicket"("userId");

ALTER TABLE "GrievanceTicket"
  ADD CONSTRAINT "GrievanceTicket_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrievanceTicket"
  ADD CONSTRAINT "GrievanceTicket_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrievanceTicket"
  ADD CONSTRAINT "GrievanceTicket_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrievanceTicket"
  ADD CONSTRAINT "GrievanceTicket_assignedToEmployeeId_fkey"
  FOREIGN KEY ("assignedToEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrievanceTicket"
  ADD CONSTRAINT "GrievanceTicket_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrievanceTicket"
  ADD CONSTRAINT "GrievanceTicket_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrievanceTicket"
  ADD CONSTRAINT "GrievanceTicket_assignedByAdminId_fkey"
  FOREIGN KEY ("assignedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrievanceTicket"
  ADD CONSTRAINT "GrievanceTicket_assignedByEmployeeId_fkey"
  FOREIGN KEY ("assignedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrievanceTicket"
  ADD CONSTRAINT "GrievanceTicket_resolvedByAdminId_fkey"
  FOREIGN KEY ("resolvedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrievanceTicket"
  ADD CONSTRAINT "GrievanceTicket_resolvedByEmployeeId_fkey"
  FOREIGN KEY ("resolvedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "GrievanceComment" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdByAdminId" TEXT,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrievanceComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GrievanceComment_ticketId_createdAt_idx" ON "GrievanceComment"("ticketId", "createdAt");

ALTER TABLE "GrievanceComment"
  ADD CONSTRAINT "GrievanceComment_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "GrievanceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrievanceComment"
  ADD CONSTRAINT "GrievanceComment_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrievanceComment"
  ADD CONSTRAINT "GrievanceComment_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
