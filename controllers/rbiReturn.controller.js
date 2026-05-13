// controllers/rbiReturn.controller.js
// RBI return data extracts for NBFCs
// NBS-1: Quarterly return (liabilities & assets)
// NBS-7: Annual return (capital funds, NPAs, provisions)
// ALM:   Monthly asset-liability maturity buckets

const prisma = require("../lib/prisma");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function quarterBounds(year, quarter) {
  // quarter: 1=Apr-Jun, 2=Jul-Sep, 3=Oct-Dec, 4=Jan-Mar (Indian FY)
  const starts = [
    [year, 3, 1],   // Q1 Apr
    [year, 6, 1],   // Q2 Jul
    [year, 9, 1],   // Q3 Oct
    [year, 12, 1],  // Q4 Jan (next calendar year for FY)
  ];
  const ends = [
    [year, 5, 31],
    [year, 8, 31],
    [year, 11, 30],
    [year + 1, 2, 28],
  ];
  const [sy, sm, sd] = starts[quarter - 1];
  const [ey, em, ed] = ends[quarter - 1];
  return {
    from: new Date(sy, sm - 1, sd, 0, 0, 0),
    to: new Date(ey, em - 1, ed, 23, 59, 59),
  };
}

function fyBounds(year) {
  // Indian FY: Apr year → Mar year+1
  return {
    from: new Date(year, 3, 1, 0, 0, 0),
    to: new Date(year + 1, 2, 31, 23, 59, 59),
  };
}

function monthBounds(year, month) {
  const from = new Date(year, month - 1, 1, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59);
  return { from, to };
}

// Remaining tenure in months for a loan as of asOfDate
function remainingMonths(loan, asOfDate) {
  const end = new Date(loan.endDate);
  const diff = (end - asOfDate) / (1000 * 60 * 60 * 24 * 30.44);
  return Math.max(0, Math.round(diff));
}

// Bucket label for ALM
function almBucket(months) {
  if (months <= 1) return "0-1M";
  if (months <= 2) return "1-2M";
  if (months <= 3) return "2-3M";
  if (months <= 6) return "3-6M";
  if (months <= 12) return "6-12M";
  if (months <= 24) return "1-3Y";
  if (months <= 60) return "3-5Y";
  return "5Y+";
}

const ALM_BUCKETS = ["0-1M", "1-2M", "2-3M", "3-6M", "6-12M", "1-3Y", "3-5Y", "5Y+"];

// ─── NBS-1: Quarterly Return ──────────────────────────────────────────────────
// Simplified schedule covering assets and liabilities from loan book
exports.getNBS1 = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const quarter = parseInt(req.query.quarter) || Math.ceil((new Date().getMonth() - 2) / 3) || 1;
    const format = req.query.format || "json"; // json | csv

    if (quarter < 1 || quarter > 4) return res.status(400).json({ error: "quarter must be 1–4" });

    const { from, to } = quarterBounds(year, quarter);

    // Active loan book as at quarter end
    const loans = await prisma.loan.findMany({
      where: {
        fileStatus: { in: ["ACTIVE", "OVERDUE", "DEFAULTED", "LEGAL_ACTION", "UNDER_COLLECTION"] },
        disbursedDate: { lte: to },
      },
      select: {
        id: true,
        principalLoanAmount: true,
        totalPaidPrincipal: true,
        pendingAmount: true,
        interestRate: true,
        endDate: true,
        isDefaulted: true,
        fileStatus: true,
        disbursedDate: true,
      },
    });

    // Disbursements during the quarter
    const disbursed = await prisma.loan.findMany({
      where: {
        disbursedDate: { gte: from, lte: to },
      },
      select: { principalLoanAmount: true },
    });

    // Collections during the quarter
    const payments = await prisma.payment.findMany({
      where: {
        paymentDate: { gte: from, lte: to },
        verified: true,
        status: "PAID",
      },
      select: { amount: true },
    });

    const outstandingPrincipal = loans.reduce((s, l) => s + (l.pendingAmount || 0), 0);
    const npaLoans = loans.filter((l) => l.isDefaulted || l.fileStatus === "DEFAULTED" || l.fileStatus === "LEGAL_ACTION");
    const npaAmount = npaLoans.reduce((s, l) => s + (l.pendingAmount || 0), 0);
    const totalDisbursed = disbursed.reduce((s, l) => s + l.principalLoanAmount, 0);
    const totalCollected = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

    const data = {
      returnType: "NBS-1",
      period: { year, quarter, from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] },
      generatedAt: new Date().toISOString(),
      loanBook: {
        totalActiveLoans: loans.length,
        outstandingPrincipal: Math.round(outstandingPrincipal),
        npaLoans: npaLoans.length,
        npaAmount: Math.round(npaAmount),
        npaRatioPct: loans.length > 0 ? +((npaAmount / outstandingPrincipal) * 100).toFixed(2) : 0,
      },
      quarterActivity: {
        disbursements: disbursed.length,
        totalDisbursed: Math.round(totalDisbursed),
        totalCollected: Math.round(totalCollected),
        netChange: Math.round(totalDisbursed - totalCollected),
      },
      assetClassification: {
        standard: loans.filter((l) => !l.isDefaulted && !["DEFAULTED", "LEGAL_ACTION", "OVERDUE"].includes(l.fileStatus)).length,
        subStandard: loans.filter((l) => l.fileStatus === "OVERDUE").length,
        doubtful: loans.filter((l) => l.fileStatus === "DEFAULTED").length,
        loss: loans.filter((l) => l.fileStatus === "LEGAL_ACTION").length,
      },
    };

    if (format === "csv") {
      const rows = [
        ["Field", "Value"],
        ["Return Type", "NBS-1"],
        ["Year", year],
        ["Quarter", quarter],
        ["Period From", data.period.from],
        ["Period To", data.period.to],
        ["Generated At", data.generatedAt],
        [],
        ["LOAN BOOK"],
        ["Total Active Loans", data.loanBook.totalActiveLoans],
        ["Outstanding Principal (INR)", data.loanBook.outstandingPrincipal],
        ["NPA Loans", data.loanBook.npaLoans],
        ["NPA Amount (INR)", data.loanBook.npaAmount],
        ["NPA Ratio (%)", data.loanBook.npaRatioPct],
        [],
        ["QUARTER ACTIVITY"],
        ["Disbursements (count)", data.quarterActivity.disbursements],
        ["Total Disbursed (INR)", data.quarterActivity.totalDisbursed],
        ["Total Collected (INR)", data.quarterActivity.totalCollected],
        ["Net Change (INR)", data.quarterActivity.netChange],
        [],
        ["ASSET CLASSIFICATION"],
        ["Standard", data.assetClassification.standard],
        ["Sub-Standard (Overdue)", data.assetClassification.subStandard],
        ["Doubtful (Defaulted)", data.assetClassification.doubtful],
        ["Loss (Legal Action)", data.assetClassification.loss],
      ];
      const csv = rows.map((r) => r.join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="NBS-1_Q${quarter}_${year}.csv"`);
      return res.send(csv);
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("NBS-1 error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ─── NBS-7: Annual Return ─────────────────────────────────────────────────────
// Capital funds adequacy, NPA provisions, income/expenditure summary
exports.getNBS7 = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear() - 1; // default: last FY start year
    const format = req.query.format || "json";

    const { from, to } = fyBounds(year);

    // All active + closed loans for the FY
    const allLoans = await prisma.loan.findMany({
      where: {
        OR: [
          { disbursedDate: { gte: from, lte: to } },
          { fileStatus: { in: ["ACTIVE", "OVERDUE", "DEFAULTED", "LEGAL_ACTION", "WRITTEN_OFF"] } },
        ],
      },
      select: {
        id: true,
        principalLoanAmount: true,
        pendingAmount: true,
        totalPaidPrincipal: true,
        totalPaidInterest: true,
        totalPaidFine: true,
        fileStatus: true,
        isDefaulted: true,
        disbursedDate: true,
      },
    });

    // Interest income for the FY from payments
    const payments = await prisma.payment.findMany({
      where: { paymentDate: { gte: from, lte: to }, verified: true, status: "PAID" },
      select: { amount: true },
    });

    const activeLoans = allLoans.filter((l) =>
      ["ACTIVE", "OVERDUE", "DEFAULTED", "LEGAL_ACTION", "UNDER_COLLECTION"].includes(l.fileStatus)
    );
    const npaLoans = allLoans.filter((l) => l.isDefaulted || ["DEFAULTED", "LEGAL_ACTION", "WRITTEN_OFF"].includes(l.fileStatus));
    const writtenOff = allLoans.filter((l) => l.fileStatus === "WRITTEN_OFF");

    const outstandingPrincipal = activeLoans.reduce((s, l) => s + (l.pendingAmount || 0), 0);
    const npaGross = npaLoans.reduce((s, l) => s + (l.pendingAmount || 0), 0);
    const writtenOffAmt = writtenOff.reduce((s, l) => s + (l.pendingAmount || 0), 0);
    const totalInterestIncome = allLoans.reduce((s, l) => s + (l.totalPaidInterest || 0), 0);
    const totalFineIncome = allLoans.reduce((s, l) => s + (l.totalPaidFine || 0), 0);
    const totalCollections = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

    // Provisioning per RBI norms (simplified):
    // Sub-standard (overdue): 15% of outstanding
    // Doubtful ≤ 1 yr: 25%, 1-3 yr: 40%, >3 yr: 100%
    // Loss: 100%
    const subStandard = allLoans.filter((l) => l.fileStatus === "OVERDUE");
    const doubtful = allLoans.filter((l) => l.fileStatus === "DEFAULTED");
    const lossAssets = allLoans.filter((l) => ["LEGAL_ACTION", "WRITTEN_OFF"].includes(l.fileStatus));

    const provisionRequired =
      subStandard.reduce((s, l) => s + (l.pendingAmount || 0) * 0.15, 0) +
      doubtful.reduce((s, l) => s + (l.pendingAmount || 0) * 0.25, 0) +
      lossAssets.reduce((s, l) => s + (l.pendingAmount || 0) * 1.0, 0);

    const data = {
      returnType: "NBS-7",
      period: { fyYear: `${year}-${(year + 1).toString().slice(2)}`, from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] },
      generatedAt: new Date().toISOString(),
      loanBook: {
        totalLoans: allLoans.length,
        activeLoans: activeLoans.length,
        outstandingPrincipal: Math.round(outstandingPrincipal),
      },
      npaPosition: {
        grossNPA: Math.round(npaGross),
        grossNPARatioPct: outstandingPrincipal > 0 ? +((npaGross / outstandingPrincipal) * 100).toFixed(2) : 0,
        writtenOff: Math.round(writtenOffAmt),
        subStandardCount: subStandard.length,
        doubtfulCount: doubtful.length,
        lossCount: lossAssets.length,
      },
      provisions: {
        requiredProvision: Math.round(provisionRequired),
        subStandardProvision: Math.round(subStandard.reduce((s, l) => s + (l.pendingAmount || 0) * 0.15, 0)),
        doubtfulProvision: Math.round(doubtful.reduce((s, l) => s + (l.pendingAmount || 0) * 0.25, 0)),
        lossProvision: Math.round(lossAssets.reduce((s, l) => s + (l.pendingAmount || 0), 0)),
      },
      incomeStatement: {
        interestIncome: Math.round(totalInterestIncome),
        penalFeeIncome: Math.round(totalFineIncome),
        totalCollections: Math.round(totalCollections),
      },
    };

    if (format === "csv") {
      const rows = [
        ["Field", "Value"],
        ["Return Type", "NBS-7"],
        ["FY", data.period.fyYear],
        ["Period From", data.period.from],
        ["Period To", data.period.to],
        ["Generated At", data.generatedAt],
        [],
        ["LOAN BOOK"],
        ["Total Loans", data.loanBook.totalLoans],
        ["Active Loans", data.loanBook.activeLoans],
        ["Outstanding Principal (INR)", data.loanBook.outstandingPrincipal],
        [],
        ["NPA POSITION"],
        ["Gross NPA (INR)", data.npaPosition.grossNPA],
        ["Gross NPA Ratio (%)", data.npaPosition.grossNPARatioPct],
        ["Written Off (INR)", data.npaPosition.writtenOff],
        ["Sub-Standard Count", data.npaPosition.subStandardCount],
        ["Doubtful Count", data.npaPosition.doubtfulCount],
        ["Loss Count", data.npaPosition.lossCount],
        [],
        ["PROVISIONS"],
        ["Required Provision (INR)", data.provisions.requiredProvision],
        ["Sub-Standard Provision", data.provisions.subStandardProvision],
        ["Doubtful Provision", data.provisions.doubtfulProvision],
        ["Loss Provision", data.provisions.lossProvision],
        [],
        ["INCOME STATEMENT"],
        ["Interest Income (INR)", data.incomeStatement.interestIncome],
        ["Penal Fee Income (INR)", data.incomeStatement.penalFeeIncome],
        ["Total Collections (INR)", data.incomeStatement.totalCollections],
      ];
      const csv = rows.map((r) => r.join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="NBS-7_FY${year}.csv"`);
      return res.send(csv);
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("NBS-7 error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ─── ALM: Monthly Asset-Liability Maturity ────────────────────────────────────
// Groups loan outstanding into residual maturity buckets
exports.getALM = async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const format = req.query.format || "json";

    if (month < 1 || month > 12) return res.status(400).json({ error: "month must be 1–12" });

    const { to: asOf } = monthBounds(year, month);

    const loans = await prisma.loan.findMany({
      where: {
        fileStatus: { in: ["ACTIVE", "OVERDUE", "DEFAULTED", "LEGAL_ACTION", "UNDER_COLLECTION"] },
        disbursedDate: { lte: asOf },
      },
      select: {
        id: true,
        pendingAmount: true,
        endDate: true,
        interestRate: true,
        monthlyPayableAmount: true,
      },
    });

    // Initialise buckets
    const buckets = {};
    ALM_BUCKETS.forEach((b) => {
      buckets[b] = { count: 0, outstandingPrincipal: 0, monthlyEMI: 0 };
    });

    for (const loan of loans) {
      const rem = remainingMonths(loan, asOf);
      const bucket = almBucket(rem);
      buckets[bucket].count += 1;
      buckets[bucket].outstandingPrincipal += loan.pendingAmount || 0;
      buckets[bucket].monthlyEMI += loan.monthlyPayableAmount || 0;
    }

    // Round numbers
    ALM_BUCKETS.forEach((b) => {
      buckets[b].outstandingPrincipal = Math.round(buckets[b].outstandingPrincipal);
      buckets[b].monthlyEMI = Math.round(buckets[b].monthlyEMI);
    });

    const totalOutstanding = ALM_BUCKETS.reduce((s, b) => s + buckets[b].outstandingPrincipal, 0);

    const data = {
      returnType: "ALM",
      period: { year, month, asOf: asOf.toISOString().split("T")[0] },
      generatedAt: new Date().toISOString(),
      totalLoans: loans.length,
      totalOutstanding,
      buckets,
    };

    if (format === "csv") {
      const rows = [
        ["Return Type", "ALM"],
        ["Year", year],
        ["Month", month],
        ["As Of", data.period.asOf],
        ["Generated At", data.generatedAt],
        [],
        ["Bucket", "Loan Count", "Outstanding Principal (INR)", "Monthly EMI (INR)"],
        ...ALM_BUCKETS.map((b) => [
          b,
          buckets[b].count,
          buckets[b].outstandingPrincipal,
          buckets[b].monthlyEMI,
        ]),
        [],
        ["TOTAL", loans.length, totalOutstanding, ""],
      ];
      const csv = rows.map((r) => r.join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="ALM_${year}_${String(month).padStart(2, "0")}.csv"`);
      return res.send(csv);
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("ALM error:", err);
    res.status(500).json({ error: err.message });
  }
};
