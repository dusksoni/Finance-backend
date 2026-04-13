// controllers/npa.controller.js
// NPA (Non-Performing Asset) aging, write-off, and settlement reports

const prisma = require("../lib/prisma");

// ─── NPA Aging Report ─────────────────────────────────────────────────────
// Groups overdue loans by DPD bucket with outstanding amounts and counts

exports.getNpaAgingReport = async (req, res) => {
  try {
    const { branchId, loanTypeId, asOf } = req.query;
    const asOfDate = asOf ? new Date(asOf) : new Date();

    const loanWhere = { fileStatus: { in: ["ACTIVE", "OVERDUE", "DEFAULTED"] } };
    if (branchId) loanWhere.branchId = branchId;
    if (loanTypeId) loanWhere.loanTypeId = loanTypeId;

    const loans = await prisma.loan.findMany({
      where: loanWhere,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        loanType: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        emi: {
          where: { status: { in: ["UNPAID", "PARTIAL"] }, paymentFor: { lte: asOfDate } },
          orderBy: { paymentFor: "asc" },
        },
      },
    });

    const buckets = {
      "1-30": { label: "1-30 DPD", loans: [], totalOutstanding: 0, count: 0 },
      "31-60": { label: "31-60 DPD", loans: [], totalOutstanding: 0, count: 0 },
      "61-90": { label: "61-90 DPD", loans: [], totalOutstanding: 0, count: 0 },
      "91-180": { label: "91-180 DPD", loans: [], totalOutstanding: 0, count: 0 },
      "181-365": { label: "181-365 DPD", loans: [], totalOutstanding: 0, count: 0 },
      "365+": { label: "365+ DPD (NPA)", loans: [], totalOutstanding: 0, count: 0 },
    };

    let grandTotal = 0;
    let grandCount = 0;

    for (const loan of loans) {
      if (!loan.emi.length) continue;

      // DPD = days since oldest unpaid EMI due date
      const oldestOverdueDate = loan.emi[0].paymentFor;
      const dpd = Math.floor((asOfDate - new Date(oldestOverdueDate)) / (1000 * 60 * 60 * 24));

      if (dpd <= 0) continue;

      const outstanding = loan.emi.reduce((sum, e) => {
        const emiAmt = Number(e.emiPayAmount || 0);
        const paid = Number(e.amountPaidSoFar || 0);
        return sum + Math.max(0, emiAmt - paid);
      }, 0);

      const loanSummary = {
        loanId: loan.id,
        fileNo: loan.fileNo,
        borrower: `${loan.user.firstName} ${loan.user.lastName}`,
        mobile: loan.user.phone,
        loanType: loan.loanType?.name,
        branch: loan.branch?.name,
        dpd,
        outstanding: Math.round(outstanding),
        pendingEmiCount: loan.emi.length,
        oldestOverdueDate: oldestOverdueDate,
      };

      let bucket;
      if (dpd <= 30) bucket = "1-30";
      else if (dpd <= 60) bucket = "31-60";
      else if (dpd <= 90) bucket = "61-90";
      else if (dpd <= 180) bucket = "91-180";
      else if (dpd <= 365) bucket = "181-365";
      else bucket = "365+";

      buckets[bucket].loans.push(loanSummary);
      buckets[bucket].totalOutstanding += outstanding;
      buckets[bucket].count += 1;
      grandTotal += outstanding;
      grandCount += 1;
    }

    // Round totals
    Object.values(buckets).forEach((b) => {
      b.totalOutstanding = Math.round(b.totalOutstanding);
    });

    res.json({
      data: {
        asOf: asOfDate,
        buckets,
        summary: {
          totalLoans: grandCount,
          totalOutstanding: Math.round(grandTotal),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate NPA aging report", message: err.message });
  }
};

// ─── NPA Summary (portfolio at risk) ────────────────────────────────────────
exports.getNpaSummary = async (req, res) => {
  try {
    const { branchId } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;

    const [totalActive, overdue, npa, writeOff, settlement] = await Promise.all([
      prisma.loan.count({ where: { ...where, fileStatus: { in: ["ACTIVE", "OVERDUE", "DEFAULTED"] } } }),
      prisma.loan.count({ where: { ...where, fileStatus: "OVERDUE" } }),
      prisma.loan.count({ where: { ...where, fileStatus: "DEFAULTED" } }),
      prisma.loan.count({ where: { ...where, fileStatus: "WRITTEN_OFF" } }),
      prisma.loan.count({ where: { ...where, fileStatus: "SETTLED" } }),
    ]);

    const [overdueAmt, npaAmt] = await Promise.all([
      prisma.loan.aggregate({ where: { ...where, fileStatus: "OVERDUE" }, _sum: { pendingAmount: true } }),
      prisma.loan.aggregate({ where: { ...where, fileStatus: "DEFAULTED" }, _sum: { pendingAmount: true } }),
    ]);

    const totalPortfolio = await prisma.loan.aggregate({
      where: { ...where, fileStatus: { in: ["ACTIVE", "OVERDUE", "DEFAULTED"] } },
      _sum: { principalLoanAmount: true },
    });

    const totalPrincipal = totalPortfolio._sum.principalLoanAmount || 0;
    const npaAmount = npaAmt._sum.pendingAmount || 0;
    const overdueAmount = overdueAmt._sum.pendingAmount || 0;

    res.json({
      data: {
        totalActiveLoans: totalActive,
        overdueLoans: overdue,
        npaLoans: npa,
        writtenOffLoans: writeOff,
        settledLoans: settlement,
        overdueOutstanding: Math.round(overdueAmount),
        npaOutstanding: Math.round(npaAmount),
        totalPortfolioPrincipal: Math.round(totalPrincipal),
        par30: totalPrincipal > 0 ? ((overdueAmount + npaAmount) / totalPrincipal * 100).toFixed(2) : "0.00",
        par90: totalPrincipal > 0 ? (npaAmount / totalPrincipal * 100).toFixed(2) : "0.00",
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get NPA summary", message: err.message });
  }
};

// ─── Write-off & Settlement Report ──────────────────────────────────────────
exports.getWriteOffReport = async (req, res) => {
  try {
    const { fromDate, toDate, type } = req.query;

    const where = {};
    if (type === "WRITTEN_OFF") where.status = "WRITTEN_OFF";
    else if (type === "SETTLED") where.status = "SETTLED";
    else where.status = { in: ["WRITTEN_OFF", "SETTLED"] };

    if (fromDate || toDate) {
      where.updatedAt = {};
      if (fromDate) where.updatedAt.gte = new Date(fromDate);
      if (toDate) where.updatedAt.lte = new Date(toDate);
    }

    const loans = await prisma.loan.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, phone: true } },
        loanType: { select: { name: true } },
        branch: { select: { name: true } },
        restructuringRequests: {
          where: { status: "APPLIED", requestType: { in: ["WRITE_OFF", "SETTLEMENT"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const data = loans.map((l) => ({
      loanId: l.id,
      fileNo: l.fileNo,
      borrower: `${l.user.firstName} ${l.user.lastName}`,
      mobile: l.user.phone,
      loanType: l.loanType?.name,
      branch: l.branch?.name,
      status: l.status,
      principalAmount: l.principalLoanAmount,
      totalPaid: l.totalPaidAmount,
      pendingAtClose: l.pendingAmount,
      restructuringNotes: l.restructuringRequests[0]?.notes || null,
      closedAt: l.updatedAt,
    }));

    res.json({ data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to get write-off report", message: err.message });
  }
};

// ─── NACH Mandate Status Report ─────────────────────────────────────────────
exports.getNachMandateReport = async (req, res) => {
  try {
    const { status, branchId, fromDate, toDate } = req.query;

    const where = {};
    if (status) where.status = status;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const mandates = await prisma.nachMandate.findMany({
      where,
      include: {
        loan: {
          select: {
            fileNo: true,
            branch: { select: { name: true } },
          },
        },
        user: { select: { firstName: true, lastName: true, phone: true } },
        bounceEvents: { select: { id: true, bounceDate: true, bounceCode: true, chargeCollected: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const filtered = branchId
      ? mandates.filter((m) => m.loan?.branch && m.loan.branch.id === branchId)
      : mandates;

    const statusCounts = filtered.reduce((acc, m) => {
      acc[m.status] = (acc[m.status] || 0) + 1;
      return acc;
    }, {});

    res.json({
      data: filtered.map((m) => ({
        mandateId: m.id,
        loanFileNo: m.loan?.fileNo,
        branch: m.loan?.branch?.name,
        borrower: `${m.user.firstName} ${m.user.lastName}`,
        mobile: m.user.phone,
        mandateType: m.mandateType,
        status: m.status,
        umrn: m.umrn,
        bankName: m.bankName,
        accountType: m.accountType,
        maxAmount: m.maxAmount,
        frequency: m.frequency,
        startDate: m.startDate,
        endDate: m.endDate,
        bounceCount: m.bounceEvents.length,
        uncollectedBounces: m.bounceEvents.filter((b) => !b.chargeCollected).length,
        createdAt: m.createdAt,
      })),
      summary: statusCounts,
      total: filtered.length,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get NACH mandate report", message: err.message });
  }
};

// ─── Employee Performance Report ────────────────────────────────────────────
exports.getEmployeePerformanceReport = async (req, res) => {
  try {
    const { fromDate, toDate, branchId } = req.query;
    const from = fromDate ? new Date(fromDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = toDate ? new Date(toDate) : new Date();

    const paymentWhere = { createdAt: { gte: from, lte: to } };

    const employees = await prisma.employee.findMany({
      where: branchId ? { branchId } : {},
      select: {
        id: true,
        name: true,
        branch: { select: { name: true } },
      },
    });

    const results = await Promise.all(
      employees.map(async (emp) => {
        const [loansCreated, paymentsCollected, collectionCases, casesResolved, grievancesHandled] =
          await Promise.all([
            prisma.loan.count({ where: { employeeId: emp.id, createdAt: { gte: from, lte: to } } }),
            prisma.payment.aggregate({
              where: { ...paymentWhere, employeeId: emp.id },
              _sum: { amount: true },
              _count: true,
            }),
            prisma.collectionCase.count({ where: { assignedToEmployeeId: emp.id } }),
            prisma.collectionCase.count({
              where: { assignedToEmployeeId: emp.id, status: "RESOLVED", updatedAt: { gte: from, lte: to } },
            }),
            prisma.grievanceTicket.count({
              where: { assignedToEmployeeId: emp.id, createdAt: { gte: from, lte: to } },
            }),
          ]);

        return {
          employeeId: emp.id,
          name: emp.name,
          branch: emp.branch?.name,
          loansCreated,
          paymentsCollected: paymentsCollected._count,
          amountCollected: Math.round(paymentsCollected._sum.amount || 0),
          collectionCasesAssigned: collectionCases,
          collectionCasesResolved: casesResolved,
          resolutionRate: collectionCases > 0 ? ((casesResolved / collectionCases) * 100).toFixed(1) : "0.0",
          grievancesHandled,
        };
      })
    );

    res.json({ data: results, period: { from, to } });
  } catch (err) {
    res.status(500).json({ error: "Failed to get employee performance report", message: err.message });
  }
};

// ─── Update Loan NPA / Write-Off Status ────────────────────────────────────
exports.updateLoanNpaStatus = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { fileStatus } = req.body;

    const allowed = ["DEFAULTED", "WRITTEN_OFF", "UNDER_COLLECTION", "LEGAL_ACTION", "ACTIVE", "OVERDUE"];
    if (!fileStatus || !allowed.includes(fileStatus)) {
      return res.status(400).json({ error: `fileStatus must be one of: ${allowed.join(", ")}` });
    }

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const updated = await prisma.loan.update({ where: { id: loanId }, data: { fileStatus } });
    res.json({ message: "Loan NPA status updated", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update NPA status", message: err.message });
  }
};
