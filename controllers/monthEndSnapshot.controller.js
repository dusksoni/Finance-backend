const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

exports.generateSnapshot = async (req, res) => {
  try {
    const now = new Date();
    const month = req.body.month || now.getMonth() + 1;
    const year = req.body.year || now.getFullYear();
    const snapshotDate = new Date(year, month - 1 + 1, 0); // last day of month

    // Check if already exists
    const existing = await prisma.monthEndSnapshot.findUnique({ where: { month_year: { month, year } } });
    if (existing) return res.status(409).json({ error: "Snapshot already exists for this month", data: existing });

    const [loans, emis] = await Promise.all([
      prisma.loan.findMany({
        select: {
          id: true, fileStatus: true, principalLoanAmount: true,
          pendingAmount: true, totalPaidAmount: true, branchId: true, loanTypeId: true,
        },
      }),
      prisma.eMI.findMany({
        where: { status: { in: ["UNPAID", "PARTIAL"] }, paymentFor: { lt: now } },
        select: { emiPayAmount: true, amountPaidSoFar: true, loanId: true },
      }),
    ]);

    const totalLoans = loans.length;
    const activeLoans = loans.filter(l => l.fileStatus === "ACTIVE").length;
    const overdueLoans = loans.filter(l => l.fileStatus === "OVERDUE").length;
    const defaultedLoans = loans.filter(l => l.fileStatus === "DEFAULTED").length;
    const closedLoans = loans.filter(l => l.isClosed).length;
    const writtenOffLoans = loans.filter(l => l.fileStatus === "WRITTEN_OFF");

    const totalDisbursed = loans.reduce((s, l) => s + Number(l.principalLoanAmount || 0), 0);
    const totalOutstanding = loans.filter(l => !l.isClosed).reduce((s, l) => s + Number(l.pendingAmount || 0), 0);
    const totalCollected = loans.reduce((s, l) => s + Number(l.totalPaidAmount || 0), 0);

    const overdueEmiAmountMap = {};
    for (const e of emis) {
      const due = Math.max(Number(e.emiPayAmount || 0) - Number(e.amountPaidSoFar || 0), 0);
      overdueEmiAmountMap[e.loanId] = (overdueEmiAmountMap[e.loanId] || 0) + due;
    }
    const totalOverdue = Object.values(overdueEmiAmountMap).reduce((s, v) => s + v, 0);

    const writtenOffAmount = writtenOffLoans.reduce((s, l) => s + Number(l.pendingAmount || 0), 0);

    // Bucket breakdown
    const buckets = { CURRENT: 0, "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    // simplified: based on loan status counts (full DPD would need collectionCase data)
    buckets.CURRENT = activeLoans;
    buckets["0-30"] = overdueLoans;

    // Branch and loanType breakdown
    const branchBreakdown = {};
    const loanTypeBreakdown = {};
    for (const l of loans) {
      if (l.branchId) {
        if (!branchBreakdown[l.branchId]) branchBreakdown[l.branchId] = { count: 0, outstanding: 0 };
        branchBreakdown[l.branchId].count++;
        branchBreakdown[l.branchId].outstanding += Number(l.pendingAmount || 0);
      }
      if (l.loanTypeId) {
        if (!loanTypeBreakdown[l.loanTypeId]) loanTypeBreakdown[l.loanTypeId] = { count: 0, outstanding: 0 };
        loanTypeBreakdown[l.loanTypeId].count++;
        loanTypeBreakdown[l.loanTypeId].outstanding += Number(l.pendingAmount || 0);
      }
    }

    const snapshot = await prisma.monthEndSnapshot.create({
      data: {
        snapshotDate,
        month,
        year,
        totalLoans,
        activeLoans,
        overdueLoans,
        defaultedLoans,
        closedLoans,
        totalDisbursed,
        totalOutstanding,
        totalOverdue,
        totalCollected,
        writtenOffAmount,
        writtenOffCount: writtenOffLoans.length,
        bucketCurrent: buckets.CURRENT,
        bucket0to30: buckets["0-30"],
        bucket31to60: buckets["31-60"],
        bucket61to90: buckets["61-90"],
        bucket90Plus: buckets["90+"],
        branchBreakdown,
        loanTypeBreakdown,
        generatedByAdminId: req.user.adminId,
        generatedByEmployeeId: req.user.employeeId,
      },
    });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "MONTH_END_SNAPSHOT_GENERATED", table: "MonthEndSnapshot", targetId: snapshot.id, metadata: { month, year } });
    res.status(201).json({ message: "Snapshot generated", data: snapshot });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate snapshot", message: err.message });
  }
};

exports.listSnapshots = async (req, res) => {
  try {
    const snapshots = await prisma.monthEndSnapshot.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }] });
    res.json({ data: snapshots });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch snapshots" });
  }
};

exports.getSnapshot = async (req, res) => {
  try {
    const snapshot = await prisma.monthEndSnapshot.findUnique({ where: { id: req.params.id } });
    if (!snapshot) return res.status(404).json({ error: "Snapshot not found" });
    res.json({ data: snapshot });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch snapshot" });
  }
};
