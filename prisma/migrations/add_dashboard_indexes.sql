-- Add indexes for enhanced dashboard performance
-- These indexes optimize queries for date-based filtering and aggregations

-- Index for loan disbursement date queries
CREATE INDEX IF NOT EXISTS idx_loan_disbursed_date ON "Loan" ("disbursedDate") WHERE "disbursedDate" IS NOT NULL;

-- Index for loan file status (for filtering active, overdue, pending loans)
CREATE INDEX IF NOT EXISTS idx_loan_file_status ON "Loan" ("fileStatus");

-- Index for loan isClosed status
CREATE INDEX IF NOT EXISTS idx_loan_is_closed ON "Loan" ("isClosed");

-- Index for loan branch filtering
CREATE INDEX IF NOT EXISTS idx_loan_branch_id ON "Loan" ("branchId") WHERE "branchId" IS NOT NULL;

-- Index for loan employee filtering
CREATE INDEX IF NOT EXISTS idx_loan_employee_id ON "Loan" ("employeeId") WHERE "employeeId" IS NOT NULL;

-- Index for payment date queries
CREATE INDEX IF NOT EXISTS idx_payment_payment_date ON "Payment" ("paymentDate") WHERE "paymentDate" IS NOT NULL;

-- Index for payment status filtering
CREATE INDEX IF NOT EXISTS idx_payment_status ON "Payment" ("status");

-- Index for EMI payment date (for upcoming EMIs and DPD calculations)
CREATE INDEX IF NOT EXISTS idx_emi_payment_for ON "EMI" ("paymentFor");

-- Index for EMI status
CREATE INDEX IF NOT EXISTS idx_emi_status ON "EMI" ("status");

-- Composite index for EMI loan relationship
CREATE INDEX IF NOT EXISTS idx_emi_loan_status ON "EMI" ("loanId", "status", "paymentFor");

-- Index for employee branch relationship
CREATE INDEX IF NOT EXISTS idx_employee_branch_id ON "Employee" ("branchId") WHERE "branchId" IS NOT NULL;

-- Index for action log created date
CREATE INDEX IF NOT EXISTS idx_action_log_created_at ON "ActionLog" ("createdAt" DESC);

-- Index for action log employee filtering
CREATE INDEX IF NOT EXISTS idx_action_log_employee_id ON "ActionLog" ("employeeId") WHERE "employeeId" IS NOT NULL;

-- Composite index for loan aggregations by branch
CREATE INDEX IF NOT EXISTS idx_loan_branch_status ON "Loan" ("branchId", "fileStatus") WHERE "branchId" IS NOT NULL;

-- Composite index for loan aggregations by employee
CREATE INDEX IF NOT EXISTS idx_loan_employee_status ON "Loan" ("employeeId", "fileStatus") WHERE "employeeId" IS NOT NULL;

-- Index for loan type grouping
CREATE INDEX IF NOT EXISTS idx_loan_type_id ON "Loan" ("loanTypeId") WHERE "loanTypeId" IS NOT NULL;

-- Composite index for date range queries on disbursement
CREATE INDEX IF NOT EXISTS idx_loan_disbursed_date_branch ON "Loan" ("disbursedDate", "branchId") WHERE "disbursedDate" IS NOT NULL;

-- Composite index for date range queries on payments
CREATE INDEX IF NOT EXISTS idx_payment_date_status ON "Payment" ("paymentDate", "status") WHERE "paymentDate" IS NOT NULL;
