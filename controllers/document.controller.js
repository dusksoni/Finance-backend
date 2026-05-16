// controllers/document.controller.js
// PDF generation: KFS, Sanction Letter, Loan Agreement, No Dues Certificate, SOA

const prisma = require("../lib/prisma");
const PDFDocument = require("pdfkit");
const { buildEffectiveConfigMap } = require("../utils/appConfig");

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getConfig() {
  const records = await prisma.appConfig.findMany();
  return buildEffectiveConfigMap(records);
}

function formatINR(val) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(val || 0));
}

function formatDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function initDoc(res, filename) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

function drawHeader(doc, config, title) {
  const company = config["branding.company_profile"] || {};
  doc.fontSize(18).font("Helvetica-Bold").text(company.companyName || "Finance Company", { align: "center" });
  if (company.legalName && company.legalName !== company.companyName) {
    doc.fontSize(10).font("Helvetica").text(company.legalName, { align: "center" });
  }
  const address = [company.addressLine1, company.addressLine2, company.city, company.state, company.pincode].filter(Boolean).join(", ");
  if (address) doc.fontSize(9).text(address, { align: "center" });
  if (company.supportEmail || company.supportPhone) {
    doc.fontSize(9).text([company.supportEmail, company.supportPhone].filter(Boolean).join(" | "), { align: "center" });
  }
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);
  doc.fontSize(13).font("Helvetica-Bold").text(title, { align: "center", underline: true });
  doc.moveDown(1);
}

function drawFooter(doc, config, disclaimer) {
  const company = config["branding.company_profile"] || {};
  const receipts = config["branding.receipt_preferences"] || {};
  const y = doc.page.height - 80;
  doc.moveTo(50, y).lineTo(545, y).stroke();
  doc.fontSize(8).font("Helvetica").fillColor("#555");
  if (disclaimer) doc.text(disclaimer, 50, y + 6, { width: 495, align: "center" });
  if (receipts.footerText) doc.text(receipts.footerText, 50, doc.y + 2, { width: 495, align: "center" });
  if (company.supportEmail) doc.text(`For queries: ${company.supportEmail}${company.supportPhone ? " | " + company.supportPhone : ""}`, { align: "center" });
}

function kv(doc, label, value, opts = {}) {
  const labelWidth = opts.labelWidth || 200;
  const x = opts.x || 50;
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).text(label + ":", x, y, { continued: false, width: labelWidth });
  doc.font("Helvetica").fontSize(9).text(String(value || "-"), x + labelWidth, y, { width: 300 });
  doc.moveDown(0.3);
}

async function getLoanFull(loanId) {
  return prisma.loan.findUnique({
    where: { id: loanId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      loanType: { select: { name: true, interestRate: true } },
      branch: { select: { name: true, address: true } },
      emi: { orderBy: { paymentFor: "asc" } },
    },
  });
}

// ─── KFS — Key Fact Statement ─────────────────────────────────────────────────
exports.generateKFS = async (req, res) => {
  try {
    const { loanId } = req.params;
    const loan = await getLoanFull(loanId);
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    const config = await getConfig();
    const kfsConfig = config["nbfc.kfs"] || {};
    const penalConfig = config["nbfc.penal_interest"] || {};
    const gstConfig = config["nbfc.processing_fee_gst"] || {};
    const foreclosureConfig = config["nbfc.foreclosure"] || {};
    const loanDocConfig = config["nbfc.loan_documents"] || {};

    const doc = initDoc(res, `KFS-${loan.fileNo}.pdf`);
    drawHeader(doc, config, "KEY FACT STATEMENT (KFS)");

    doc.fontSize(8).font("Helvetica").fillColor("#555")
      .text("As mandated by Reserve Bank of India circular on Interest Rate and other charges on loans.", { align: "center" });
    doc.moveDown(0.5).fillColor("black");

    // Loan details table
    doc.fontSize(11).font("Helvetica-Bold").text("A. Loan Details");
    doc.moveDown(0.3);
    kv(doc, "Borrower Name", `${loan.user.firstName} ${loan.user.lastName}`);
    kv(doc, "Mobile Number", loan.user.phone);
    kv(doc, "Loan File Number", loan.fileNo);
    kv(doc, "Loan Product", loan.loanType?.name);
    kv(doc, "Branch", loan.branch?.name);
    kv(doc, "Loan Amount Sanctioned", formatINR(loan.principalLoanAmount));
    kv(doc, "Tenure", `${loan.tenureMonths} Months`);
    kv(doc, "Rate of Interest", `${loan.interestRate || loan.loanType?.interestRate}% per annum (Reducing Balance)`);
    kv(doc, "EMI Amount", formatINR(loan.monthlyPayableAmount));
    kv(doc, "Total Amount Payable", formatINR(loan.totalAmount));
    kv(doc, "Disbursement Date", formatDate(loan.disbursedDate || loan.approvedAt));
    kv(doc, "First EMI Date", loan.emi?.[0] ? formatDate(loan.emi[0].paymentFor) : "-");

    doc.moveDown(0.8);
    doc.fontSize(11).font("Helvetica-Bold").text("B. Charges & Fees");
    doc.moveDown(0.3);
    const processingFee = Number(loan.processingFee || 0);
    const gstOnFee = gstConfig.enabled ? processingFee * ((gstConfig.cgstPercent + gstConfig.sgstPercent) / 100) : 0;
    kv(doc, "Processing Fee", formatINR(processingFee));
    kv(doc, `GST on Processing Fee (${gstConfig.cgstPercent || 9}% CGST + ${gstConfig.sgstPercent || 9}% SGST)`, gstConfig.enabled ? formatINR(gstOnFee) : "Not Applicable");
    kv(doc, "Total Processing Fee (incl. GST)", formatINR(processingFee + gstOnFee));
    kv(doc, "Penal Interest (on overdue)", penalConfig.enabled ? `${penalConfig.ratePerAnnum}% p.a. after ${penalConfig.gracePeriodDays}-day grace period` : "Not Applicable");
    kv(doc, "Pre-closure Charge", foreclosureConfig.enabled ? `${foreclosureConfig.chargePercent}% on outstanding principal` : "Not Applicable");
    kv(doc, "Bounce / Late Fee", `₹${config["nbfc.late_fee"]?.flatAmountPerBounce || 0} per missed EMI`);

    doc.moveDown(0.8);
    doc.fontSize(11).font("Helvetica-Bold").text("C. Annual Percentage Rate (APR)");
    doc.moveDown(0.3);
    // Approximate APR = interest rate + (fees amortized over tenure)
    const totalFeesAmortized = (processingFee + gstOnFee) / Number(loan.tenureMonths || 1);
    const monthlyRate = (Number(loan.interestRate || 0) / 12) / 100;
    const approxAPR = (Number(loan.interestRate || 0) + (totalFeesAmortized / Number(loan.principalLoanAmount || 1)) * 12 * 100).toFixed(2);
    kv(doc, "Approximate APR", `${approxAPR}% per annum`);
    doc.fontSize(8).font("Helvetica").fillColor("#555")
      .text("Note: APR is indicative and includes processing fee. Actual APR may vary based on disbursement date and fee waivers.", { width: 495 });
    doc.fillColor("black");

    doc.moveDown(0.8);
    doc.fontSize(11).font("Helvetica-Bold").text("D. Grievance Redressal");
    doc.moveDown(0.3);
    const company = config["branding.company_profile"] || {};
    kv(doc, "Nodal Officer Email", company.supportEmail || "—");
    kv(doc, "Support Phone", company.supportPhone || "—");
    kv(doc, "RBI Ombudsman", "https://cms.rbi.org.in");

    doc.moveDown(0.8);
    doc.fontSize(11).font("Helvetica-Bold").text("E. Acknowledgment");
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica")
      .text("I/We have read and understood the Key Fact Statement above. I/We confirm that the terms match what was communicated to me/us verbally.")
      .moveDown(1.5);

    const sigY = doc.y;
    doc.text("Borrower Signature: _______________________", 50, sigY);
    doc.text("Date: _______________", 350, sigY);
    doc.moveDown(0.5);
    doc.text(`For ${company.companyName || "Finance Company"}`);
    doc.moveDown(0.5);
    doc.text(`${loanDocConfig.authorizedSignatoryName || ""}`);
    doc.text(`${loanDocConfig.authorizedSignatoryDesignation || "Authorized Signatory"}`);

    drawFooter(doc, config, kfsConfig.footerDisclaimer || "This KFS is issued as per RBI circular on Interest Rate and other charges on loans.");
    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate KFS", message: err.message });
  }
};

// ─── Sanction Letter ──────────────────────────────────────────────────────────
exports.generateSanctionLetter = async (req, res) => {
  try {
    const { loanId } = req.params;
    const loan = await getLoanFull(loanId);
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    const config = await getConfig();
    const loanDocConfig = config["nbfc.loan_documents"] || {};
    const gstConfig = config["nbfc.processing_fee_gst"] || {};
    const company = config["branding.company_profile"] || {};

    const doc = initDoc(res, `SanctionLetter-${loan.fileNo}.pdf`);
    drawHeader(doc, config, "LOAN SANCTION LETTER");

    const refNo = `${loanDocConfig.sanctionLetterPrefix || "SL"}/${loan.fileNo}/${new Date().getFullYear()}`;
    kv(doc, "Reference No", refNo);
    kv(doc, "Date", formatDate(new Date()));
    doc.moveDown(0.5);

    const borrowerName = `${loan.user.firstName} ${loan.user.lastName}`;
    doc.fontSize(9).font("Helvetica").text(`Dear ${borrowerName},`).moveDown(0.5);
    doc.text(`We are pleased to inform you that your loan application has been sanctioned subject to the following terms and conditions:`).moveDown(0.8);

    doc.fontSize(11).font("Helvetica-Bold").text("Sanction Terms");
    doc.moveDown(0.3);
    kv(doc, "Borrower Name", borrowerName);
    kv(doc, "Loan File No.", loan.fileNo);
    kv(doc, "Loan Product", loan.loanType?.name);
    kv(doc, "Sanctioned Amount", formatINR(loan.principalLoanAmount));
    kv(doc, "Rate of Interest", `${loan.interestRate || loan.loanType?.interestRate}% per annum (Reducing Balance)`);
    kv(doc, "Loan Tenure", `${loan.tenureMonths} Months`);
    kv(doc, "EMI Amount", formatINR(loan.monthlyPayableAmount));
    kv(doc, "First EMI Date", loan.emi?.[0] ? formatDate(loan.emi[0].paymentFor) : "-");
    kv(doc, "Total Amount Payable", formatINR(loan.totalAmount));

    const processingFee = Number(loan.processingFee || 0);
    const gstOnFee = gstConfig.enabled ? processingFee * ((gstConfig.cgstPercent + gstConfig.sgstPercent) / 100) : 0;
    kv(doc, "Processing Fee", formatINR(processingFee));
    kv(doc, "GST on Processing Fee", gstConfig.enabled ? formatINR(gstOnFee) : "Nil");
    kv(doc, "Net Disbursement Amount", formatINR(Number(loan.principalLoanAmount) - processingFee - gstOnFee));

    doc.moveDown(0.8);
    doc.fontSize(11).font("Helvetica-Bold").text("Terms & Conditions");
    doc.moveDown(0.3);
    const terms = [
      "The loan is sanctioned subject to satisfactory documentation and KYC verification.",
      "The borrower shall repay the loan in equated monthly instalments (EMIs) as per the agreed schedule.",
      "Non-payment of EMI on due date shall attract penal interest and late fees as per the schedule of charges.",
      "The borrower shall not use the loan amount for any purpose other than stated in the application.",
      "The company reserves the right to recall the loan in case of default or breach of terms.",
      `${loanDocConfig.stampDutyDisclaimer || "This sanction is subject to applicable stamp duty."}`,
    ];
    terms.forEach((t, i) => {
      doc.fontSize(9).font("Helvetica").text(`${i + 1}. ${t}`).moveDown(0.2);
    });

    doc.moveDown(1);
    doc.fontSize(9).font("Helvetica").text("Please sign and return a copy of this letter as acknowledgment of acceptance of the above terms.");
    doc.moveDown(1.5);

    const sigY = doc.y;
    doc.text("Borrower Signature: _______________________", 50, sigY);
    doc.text("Date: _______________", 350, sigY);
    doc.moveDown(1);
    doc.text(`For ${company.companyName || "Finance Company"}`);
    doc.moveDown(0.5);
    doc.text(loanDocConfig.authorizedSignatoryName || "");
    doc.text(loanDocConfig.authorizedSignatoryDesignation || "Authorized Signatory");

    drawFooter(doc, config, null);
    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate sanction letter", message: err.message });
  }
};

// ─── No Dues Certificate ──────────────────────────────────────────────────────
exports.generateNoDuesCertificate = async (req, res) => {
  try {
    const { loanId } = req.params;
    const loan = await getLoanFull(loanId);
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    const config = await getConfig();
    const loanDocConfig = config["nbfc.loan_documents"] || {};
    const company = config["branding.company_profile"] || {};

    if (!["CLOSED", "FORECLOSED", "SETTLED"].includes(loan.fileStatus)) {
      return res.status(400).json({ error: "Loan is not closed. No Dues Certificate can only be issued for closed loans." });
    }

    const doc = initDoc(res, `NoDues-${loan.fileNo}.pdf`);
    drawHeader(doc, config, "NO DUES CERTIFICATE");

    const refNo = `${loanDocConfig.noDuesPrefix || "NDC"}/${loan.fileNo}/${new Date().getFullYear()}`;
    kv(doc, "Certificate No.", refNo);
    kv(doc, "Date of Issue", formatDate(new Date()));
    doc.moveDown(0.8);

    const borrowerName = `${loan.user.firstName} ${loan.user.lastName}`;
    doc.fontSize(10).font("Helvetica")
      .text("TO WHOM IT MAY CONCERN", { align: "center", underline: true })
      .moveDown(0.8);

    doc.text(`This is to certify that ${borrowerName} (Mobile: ${loan.user.phone}) had availed a loan from us with the following details:`).moveDown(0.5);

    kv(doc, "Loan File No.", loan.fileNo);
    kv(doc, "Loan Product", loan.loanType?.name);
    kv(doc, "Branch", loan.branch?.name);
    kv(doc, "Original Loan Amount", formatINR(loan.principalLoanAmount));
    kv(doc, "Loan Closure Date", formatDate(loan.updatedAt));
    kv(doc, "Closure Status", loan.fileStatus);

    doc.moveDown(0.8);
    doc.fontSize(10).font("Helvetica")
      .text(`We confirm that the above loan has been fully repaid and there are NO DUES outstanding as on the date of this certificate. The loan account stands CLOSED.`)
      .moveDown(0.5)
      .text("All post-dated cheques/NACH mandates submitted against this loan, if any, have been cancelled/returned.")
      .moveDown(1);

    doc.fontSize(9).font("Helvetica-Bold").text("Note:").font("Helvetica")
      .text("This certificate is issued at the borrower's request and is valid as on the date of issue. For any queries, please contact our branch.");
    doc.moveDown(1.5);

    doc.text(`For ${company.companyName || "Finance Company"}`);
    doc.moveDown(1.5);
    doc.text(loanDocConfig.authorizedSignatoryName || "");
    doc.text(loanDocConfig.authorizedSignatoryDesignation || "Authorized Signatory");
    doc.text(`Date: ${formatDate(new Date())}`);

    drawFooter(doc, config, null);
    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate no-dues certificate", message: err.message });
  }
};

// ─── Statement of Account (SOA) ───────────────────────────────────────────────
exports.generateSOA = async (req, res) => {
  try {
    const { loanId } = req.params;
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        user: { select: { firstName: true, lastName: true, phone: true, email: true } },
        loanType: { select: { name: true } },
        branch: { select: { name: true } },
        emi: { orderBy: { paymentFor: "asc" } },
        payments: {
          where: { status: { not: "DELETED" } },
          orderBy: { paymentDate: "asc" },
        },
      },
    });
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    const config = await getConfig();
    const company = config["branding.company_profile"] || {};

    const doc = initDoc(res, `SOA-${loan.fileNo}.pdf`);
    drawHeader(doc, config, "STATEMENT OF ACCOUNT");

    const borrowerName = `${loan.user.firstName} ${loan.user.lastName}`;
    kv(doc, "Borrower", borrowerName);
    kv(doc, "Mobile", loan.user.phone);
    kv(doc, "Loan File No.", loan.fileNo);
    kv(doc, "Loan Product", loan.loanType?.name);
    kv(doc, "Branch", loan.branch?.name);
    kv(doc, "Principal Amount", formatINR(loan.principalLoanAmount));
    kv(doc, "Rate of Interest", `${loan.interestRate}% p.a.`);
    kv(doc, "Tenure", `${loan.tenureMonths} months`);
    kv(doc, "Statement Generated On", formatDate(new Date()));
    doc.moveDown(0.8);

    // EMI schedule
    doc.fontSize(11).font("Helvetica-Bold").text("EMI Schedule");
    doc.moveDown(0.3);

    // Table header
    const cols = { no: 50, due: 100, amount: 220, paid: 320, status: 420 };
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#333");
    doc.text("#", cols.no, doc.y, { continued: true, width: 45 });
    doc.text("Due Date", cols.due, doc.y, { continued: true, width: 115 });
    doc.text("EMI Amount", cols.amount, doc.y, { continued: true, width: 95 });
    doc.text("Paid", cols.paid, doc.y, { continued: true, width: 95 });
    doc.text("Status", cols.status, doc.y, { width: 90 });
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();

    doc.font("Helvetica").fillColor("black").fontSize(8);
    let totalEmi = 0, totalPaid = 0;
    (loan.emi || []).forEach((e, i) => {
      const emiAmt = Number(e.emiPayAmount || 0);
      const paidAmt = Number(e.amountPaidSoFar || 0);
      totalEmi += emiAmt;
      totalPaid += paidAmt;
      const rowY = doc.y;
      doc.text(String(i + 1), cols.no, rowY, { continued: true, width: 45 });
      doc.text(formatDate(e.paymentFor), cols.due, rowY, { continued: true, width: 115 });
      doc.text(formatINR(emiAmt), cols.amount, rowY, { continued: true, width: 95 });
      doc.text(formatINR(paidAmt), cols.paid, rowY, { continued: true, width: 95 });
      doc.text(e.status || "-", cols.status, rowY, { width: 90 });
      doc.moveDown(0.25);
      if (doc.y > 720) { doc.addPage(); drawHeader(doc, config, "STATEMENT OF ACCOUNT (contd.)"); }
    });

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(8);
    doc.text("Total", cols.no, doc.y, { continued: true, width: 45 });
    doc.text("", cols.due, doc.y, { continued: true, width: 115 });
    doc.text(formatINR(totalEmi), cols.amount, doc.y, { continued: true, width: 95 });
    doc.text(formatINR(totalPaid), cols.paid, doc.y, { width: 95 });
    doc.moveDown(0.8);

    // Payment receipts
    if (loan.payments?.length) {
      doc.font("Helvetica-Bold").fontSize(11).text("Payment History");
      doc.moveDown(0.3);
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#333");
      doc.text("Date", 50, doc.y, { continued: true, width: 100 });
      doc.text("Receipt No.", 155, doc.y, { continued: true, width: 130 });
      doc.text("Amount", 290, doc.y, { continued: true, width: 100 });
      doc.text("Mode", 395, doc.y, { continued: true, width: 80 });
      doc.text("Status", 480, doc.y, { width: 65 });
      doc.moveDown(0.2);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.font("Helvetica").fillColor("black");

      loan.payments.forEach((p) => {
        const rowY = doc.y;
        doc.text(formatDate(p.paymentDate), 50, rowY, { continued: true, width: 100 });
        doc.text(p.receiptNumber || p.id?.slice(-8).toUpperCase() || "-", 155, rowY, { continued: true, width: 130 });
        doc.text(formatINR(p.amount), 290, rowY, { continued: true, width: 100 });
        doc.text(p.paymentMode || "-", 395, rowY, { continued: true, width: 80 });
        doc.text(p.verified ? "Verified" : "Pending", 480, rowY, { width: 65 });
        doc.moveDown(0.25);
        if (doc.y > 720) { doc.addPage(); }
      });
    }

    doc.moveDown(0.8);
    doc.fontSize(9).font("Helvetica-Bold");
    kv(doc, "Outstanding Principal", formatINR(loan.pendingAmount));
    kv(doc, "Total Amount Paid", formatINR(loan.totalPaidAmount));
    kv(doc, "Loan Status", loan.fileStatus);

    drawFooter(doc, config, "This is a computer-generated statement. No signature required.");
    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate SOA", message: err.message });
  }
};
