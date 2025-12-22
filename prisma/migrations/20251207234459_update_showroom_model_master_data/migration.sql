-- CreateTable Showroom if not exists
CREATE TABLE IF NOT EXISTS "Showroom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "address" TEXT,
    "pincode" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "email" TEXT,
    "isDeleted" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Showroom_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "showroomId" TEXT;

-- AddForeignKey for Showroom to Branch (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Showroom_branchId_fkey'
    ) THEN
        ALTER TABLE "Showroom" ADD CONSTRAINT "Showroom_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey for Loan to Showroom (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Loan_showroomId_fkey'
    ) THEN
        ALTER TABLE "Loan" ADD CONSTRAINT "Loan_showroomId_fkey" FOREIGN KEY ("showroomId") REFERENCES "Showroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Create unique index (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'Showroom_name_branchId_key'
    ) THEN
        CREATE UNIQUE INDEX "Showroom_name_branchId_key" ON "Showroom"("name", "branchId");
    END IF;
END $$;
