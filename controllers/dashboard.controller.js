const prisma = require("../lib/prisma");

// Unified dashboard summary for ADMIN and EMPLOYEE
// Scopes data based on role; employees see only their branch-linked data where applicable
exports.getSummary = async (req, res) => {
  try {
    const isAdmin = req.user?.type === "ADMIN";
    const employeeId = req.user?.employeeId || null;

    // Optional scoping: if employee, try to scope by employee.branchId when available
    let branchId = null;
    if (!isAdmin && employeeId) {
      const emp = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { branchId: true },
      });
      branchId = emp?.branchId || null;
    }

    // Build where filters based on role
    const loanWhere = {
      ...(branchId ? { branchId } : {}),
    };

    // Parallel aggregates
    const [
      totalUsers,
      totalEmployees,
      totalActiveLoans,
      totalPendingApprovalLoans,
      totalClosedLoans,
      loanAmountAgg,
      monthlyDisbursement,
      unverifiedPaymentsCount,
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.employee.count({ where: { isDeleted: false } }),
      prisma.loan.count({ where: { ...loanWhere, fileStatus: "DISBURSED" } }),
      prisma.loan.count({ where: { ...loanWhere, fileStatus: "PENDING_APPROVAL" } }),
      prisma.loan.count({ where: { ...loanWhere, isClosed: true } }),
      prisma.loan.aggregate({
        where: { ...loanWhere, fileStatus: "DISBURSED" },
        _sum: { principalLoanAmount: true, totalPaidAmount: true, pendingAmount: true },
      }),
      prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', "disbursedDate") as month,
          COUNT(*) as count,
          SUM("principalLoanAmount") as amount
        FROM "Loan"
        WHERE ${branchId ? prisma.sql`"branchId" = ${branchId} AND` : prisma.sql``}
              "disbursedDate" IS NOT NULL
          AND "disbursedDate" >= NOW() - INTERVAL '6 months'
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
      `,
      prisma.payment.count({ where: { status: "VERIFICATION_PENDING" } }),
    ]);

    const sumPrincipal = Number(loanAmountAgg._sum.principalLoanAmount || 0);
    const sumPaid = Number(loanAmountAgg._sum.totalPaidAmount || 0);
    const sumPending = Number(loanAmountAgg._sum.pendingAmount || 0);

    return res.status(200).json({
      status: 200,
      data: {
        role: isAdmin ? "ADMIN" : "EMPLOYEE",
        scope: branchId ? { branchId } : { allBranches: true },
        kpis: {
          totalUsers,
          totalEmployees,
          totalActiveLoans,
          totalPendingApprovalLoans,
          totalClosedLoans,
          totalPrincipalDisbursed: sumPrincipal,
          totalCollected: sumPaid,
          totalPending: sumPending,
          unverifiedPaymentsCount,
        },
        charts: {
          monthlyDisbursement,
        },
      },
    });
  } catch (error) {
    console.error("dashboard.summary error:", error);
    return res.status(500).json({ status: 500, error: error.message || "Failed to load dashboard" });
  }
};


