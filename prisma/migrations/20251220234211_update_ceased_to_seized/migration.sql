-- Update all existing records that use the old CEASED values to use SEIZED
UPDATE "Loan" SET "fileStatus" = 'SEIZED_INITIATED' WHERE "fileStatus" = 'CEASED_INITIATED';
UPDATE "Loan" SET "fileStatus" = 'SEIZED' WHERE "fileStatus" = 'CEASED';
