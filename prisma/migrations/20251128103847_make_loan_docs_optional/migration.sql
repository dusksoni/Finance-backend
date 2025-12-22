-- CreateTable
CREATE TABLE "_loanInvoiceDoc" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_loanInvoiceDoc_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_insuranceDoc" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_insuranceDoc_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_registrationDoc" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_registrationDoc_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_loanInvoiceDoc_B_index" ON "_loanInvoiceDoc"("B");

-- CreateIndex
CREATE INDEX "_insuranceDoc_B_index" ON "_insuranceDoc"("B");

-- CreateIndex
CREATE INDEX "_registrationDoc_B_index" ON "_registrationDoc"("B");

-- AddForeignKey
ALTER TABLE "_loanInvoiceDoc" ADD CONSTRAINT "_loanInvoiceDoc_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_loanInvoiceDoc" ADD CONSTRAINT "_loanInvoiceDoc_B_fkey" FOREIGN KEY ("B") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_insuranceDoc" ADD CONSTRAINT "_insuranceDoc_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_insuranceDoc" ADD CONSTRAINT "_insuranceDoc_B_fkey" FOREIGN KEY ("B") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_registrationDoc" ADD CONSTRAINT "_registrationDoc_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_registrationDoc" ADD CONSTRAINT "_registrationDoc_B_fkey" FOREIGN KEY ("B") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
