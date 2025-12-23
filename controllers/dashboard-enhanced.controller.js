const prisma = require("../lib/prisma");
const {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfDay,
  endOfDay,
  addDays,
  format,
  startOfWeek,
  endOfWeek,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subDays,
  differenceInDays,
  parseISO,
} = require("date-fns");

const OVERDUE_STATUSES = [
  "OVERDUE",
  "DEFAULTED",
  "UNDER_COLLECTION",
  "LEGAL_ACTION",
  "FORECLOSURE_IN_PROGRESS",
  "FORECLOSED",
];

const ACTIVE_EXCLUDE_STATUSES = [
  "CLOSED",
  "CANCELLED",
  "REJECTED",
  "WRITTEN_OFF",
];

const PENDING_APPROVAL_STATUSES = [
  "PENDING_APPROVAL",
  "IN_PROGRESS",
  "INITIATED",
];

const round2 = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const decimalToNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return parseFloat(value);
  if (typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value) || 0;
};

const combineWhere = (...conditions) => {
  const filters = conditions
    .filter(Boolean)
    .map((cond) => {
      if (!cond || typeof cond !== "object") return null;
      return Object.keys(cond).length ? cond : null;
    })
    .filter(Boolean);

  if (!filters.length) return {};
  if (filters.length === 1) return filters[0];
  return { AND: filters };
};

const resolveScope = async (user) => {
  if (!user || !["ADMIN", "EMPLOYEE"].includes(user.type)) {
    const error = new Error("Not allowed");
    error.statusCode = 403;
    throw error;
  }

  if (user.type === "ADMIN") {
    return {
      level: "ORG",
      loanWhere: {},
      permissions: [],
      meta: {
        actorType: "ADMIN",
      },
    };
  }

  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: {
      branch: {
        select: {
          id: true,
          name: true,
        },
      },
      role: {
        select: {
          name: true,
          permissions: true,
        },
      },
    },
  });

  if (!employee) {
    const error = new Error("Employee not found");
    error.statusCode = 404;
    throw error;
  }

  const permissions = employee.role?.permissions || [];
  const canViewOrg =
    permissions.includes("DASHBOARD_ORG_VIEW") ||
    permissions.includes("DASHBOARD_VIEW_ALL");
  const canViewBranch = permissions.includes("DASHBOARD_BRANCH_VIEW");

  let level = "SELF";
  let loanWhere = { employeeId: employee.id };

  if (canViewOrg) {
    level = "ORG";
    loanWhere = {};
  } else if (canViewBranch && employee.branchId) {
    level = "BRANCH";
    loanWhere = { branchId: employee.branchId };
  }

  return {
    level,
    loanWhere,
    permissions,
    employee,
    branch: employee.branch
      ? { id: employee.branch.id, name: employee.branch.name }
      : null,
    meta: {
      actorType: "EMPLOYEE",
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role?.name || null,
      },
    },
  };
};

const buildUserScope = (scope) => {
  if (scope.level === "ORG") return {};

  if (scope.level === "BRANCH") {
    if (!scope.branch?.id) return { id: { equals: "_no_branch_" } };
    return {
      loans: {
        some: {
          branchId: scope.branch.id,
        },
      },
    };
  }

  return {
    OR: [
      { employeeId: scope.employee?.id },
      {
        loans: {
          some: {
            employeeId: scope.employee?.id,
          },
        },
      },
    ],
  };
};

const buildPaymentScope = (scope) => {
  if (scope.level === "ORG") return {};

  if (scope.level === "BRANCH") {
    if (!scope.branch?.id) return { id: { equals: "_no_branch_" } };
    return {
      loan: {
        branchId: scope.branch.id,
      },
    };
  }

  return {
    OR: [
      { employeeId: scope.employee?.id },
      {
        loan: {
          employeeId: scope.employee?.id,
        },
      },
    ],
  };
};

const buildEmiScope = (scope) => {
  if (scope.level === "ORG") return {};

  if (scope.level === "BRANCH") {
    if (!scope.branch?.id) return { id: { equals: "_no_branch_" } };
    return {
      loan: {
        branchId: scope.branch.id,
      },
    };
  }

  return {
    loan: {
      employeeId: scope.employee?.id,
    },
  };
};

// Parse date range from request
const parseDateRange = (req) => {
  const { rangeType, startDate, endDate } = req.query;

  const now = new Date();
  let start, end, previousStart, previousEnd;

  switch (rangeType) {
    case "today":
      start = startOfDay(now);
      end = endOfDay(now);
      previousStart = startOfDay(subDays(now, 1));
      previousEnd = endOfDay(subDays(now, 1));
      break;

    case "yesterday":
      start = startOfDay(subDays(now, 1));
      end = endOfDay(subDays(now, 1));
      previousStart = startOfDay(subDays(now, 2));
      previousEnd = endOfDay(subDays(now, 2));
      break;

    case "this_week":
      start = startOfWeek(now, { weekStartsOn: 1 }); // Monday
      end = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
      previousStart = startOfWeek(subDays(start, 1), { weekStartsOn: 1 });
      previousEnd = endOfWeek(subDays(start, 1), { weekStartsOn: 1 });
      break;

    case "last_week":
      const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      start = lastWeekStart;
      end = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
      previousStart = startOfWeek(subDays(lastWeekStart, 1), {
        weekStartsOn: 1,
      });
      previousEnd = endOfWeek(subDays(lastWeekStart, 1), { weekStartsOn: 1 });
      break;

    case "this_month":
      start = startOfMonth(now);
      end = endOfMonth(now);
      previousStart = startOfMonth(subMonths(now, 1));
      previousEnd = endOfMonth(subMonths(now, 1));
      break;

    case "last_month":
      start = startOfMonth(subMonths(now, 1));
      end = endOfMonth(subMonths(now, 1));
      previousStart = startOfMonth(subMonths(now, 2));
      previousEnd = endOfMonth(subMonths(now, 2));
      break;

    case "this_quarter":
      start = startOfQuarter(now);
      end = endOfQuarter(now);
      const prevQuarter = subMonths(now, 3);
      previousStart = startOfQuarter(prevQuarter);
      previousEnd = endOfQuarter(prevQuarter);
      break;

    case "this_year":
      start = startOfYear(now);
      end = endOfYear(now);
      const prevYear = new Date(now.getFullYear() - 1, 0, 1);
      previousStart = startOfYear(prevYear);
      previousEnd = endOfYear(prevYear);
      break;

    case "custom":
      if (!startDate || !endDate) {
        throw new Error("Custom range requires startDate and endDate");
      }
      start = startOfDay(parseISO(startDate));
      end = endOfDay(parseISO(endDate));
      const daysDiff = differenceInDays(end, start) + 1;
      previousEnd = subDays(start, 1);
      previousStart = subDays(previousEnd, daysDiff - 1);
      previousStart = startOfDay(previousStart);
      previousEnd = endOfDay(previousEnd);
      break;

    default:
      // Default to this month
      start = startOfMonth(now);
      end = endOfMonth(now);
      previousStart = startOfMonth(subMonths(now, 1));
      previousEnd = endOfMonth(subMonths(now, 1));
  }

  return {
    start,
    end,
    previousStart,
    previousEnd,
    rangeType: rangeType || "this_month",
  };
};

// Calculate DPD (Days Past Due) buckets
const calculateDPDBuckets = async (scope, baseLoanWhere) => {
  const now = new Date();

  // Get all loans with unpaid EMIs
  const loansWithOverdueEmis = await prisma.loan.findMany({
    where: combineWhere(baseLoanWhere, {
      isClosed: false,
      emi: {
        some: {
          status: "UNPAID",
          paymentFor: {
            lt: now,
          },
        },
      },
    }),
    include: {
      emi: {
        where: {
          status: "UNPAID",
          paymentFor: {
            lt: now,
          },
        },
        orderBy: {
          paymentFor: "asc",
        },
        take: 1, // Get the oldest unpaid EMI
      },
    },
  });

  const buckets = {
    "0-30": { count: 0, amount: 0 },
    "31-60": { count: 0, amount: 0 },
    "61-90": { count: 0, amount: 0 },
    "90+": { count: 0, amount: 0 },
  };

  loansWithOverdueEmis.forEach((loan) => {
    if (loan.emi.length === 0) return;

    const oldestEmi = loan.emi[0];
    const dpd = differenceInDays(now, oldestEmi.paymentFor);
    const pendingAmount = decimalToNumber(loan.pendingAmount);

    if (dpd <= 30) {
      buckets["0-30"].count++;
      buckets["0-30"].amount += pendingAmount;
    } else if (dpd <= 60) {
      buckets["31-60"].count++;
      buckets["31-60"].amount += pendingAmount;
    } else if (dpd <= 90) {
      buckets["61-90"].count++;
      buckets["61-90"].amount += pendingAmount;
    } else {
      buckets["90+"].count++;
      buckets["90+"].amount += pendingAmount;
    }
  });

  return Object.entries(buckets).map(([bucket, data]) => ({
    bucket,
    count: data.count,
    amount: round2(data.amount),
  }));
};

// Calculate NPA (Non-Performing Assets) - loans with DPD > 90
const calculateNPA = async (scope, baseLoanWhere) => {
  const now = new Date();
  const ninetyDaysAgo = subDays(now, 90);

  // Get loans with EMIs overdue by more than 90 days
  const npaLoans = await prisma.loan.findMany({
    where: combineWhere(baseLoanWhere, {
      isClosed: false,
      emi: {
        some: {
          status: "UNPAID",
          paymentFor: {
            lt: ninetyDaysAgo,
          },
        },
      },
    }),
    select: {
      pendingAmount: true,
      totalAmount: true,
    },
  });

  const npaAmount = npaLoans.reduce(
    (sum, loan) => sum + decimalToNumber(loan.pendingAmount),
    0
  );
  const npaCount = npaLoans.length;

  // Calculate total portfolio for NPA ratio
  const totalPortfolio = await prisma.loan.aggregate({
    where: combineWhere(baseLoanWhere, {
      isClosed: false,
    }),
    _sum: {
      pendingAmount: true,
    },
  });

  const totalPending = decimalToNumber(totalPortfolio._sum?.pendingAmount);
  const npaRatio = totalPending > 0 ? (npaAmount / totalPending) * 100 : 0;

  return {
    npaCount,
    npaAmount: round2(npaAmount),
    totalPortfolio: round2(totalPending),
    npaRatio: round2(npaRatio),
  };
};

// Calculate Collection Efficiency
const calculateCollectionEfficiency = async (
  scope,
  paymentScope,
  start,
  end
) => {
  // Total EMIs due in the period
  const dueEmis = await prisma.eMI.aggregate({
    where: combineWhere(buildEmiScope(scope), {
      paymentFor: {
        gte: start,
        lte: end,
      },
    }),
    _sum: {
      emiPayAmount: true,
    },
  });

  // Total collected in the period
  const collected = await prisma.payment.aggregate({
    where: combineWhere(paymentScope, {
      paymentDate: {
        gte: start,
        lte: end,
      },
      status: "PAID",
    }),
    _sum: {
      amount: true,
    },
  });

  const dueAmount = decimalToNumber(dueEmis._sum?.emiPayAmount);
  const collectedAmount = decimalToNumber(collected._sum?.amount);
  const efficiency = dueAmount > 0 ? (collectedAmount / dueAmount) * 100 : 0;

  return {
    dueAmount: round2(dueAmount),
    collectedAmount: round2(collectedAmount),
    efficiency: round2(efficiency),
  };
};

// Calculate operational metrics
const calculateOperationalMetrics = async (
  scope,
  baseLoanWhere,
  start,
  end,
  previousStart,
  previousEnd
) => {
  // Approvals and rejections in current period
  const [approvedLoans, rejectedLoans, totalApplications] = await Promise.all([
    prisma.loan.count({
      where: combineWhere(baseLoanWhere, {
        fileStatus: "ACTIVE",
        disbursedDate: {
          gte: start,
          lte: end,
        },
      }),
    }),
    prisma.loan.count({
      where: combineWhere(baseLoanWhere, {
        fileStatus: "REJECTED",
        updatedAt: {
          gte: start,
          lte: end,
        },
      }),
    }),
    prisma.loan.count({
      where: combineWhere(baseLoanWhere, {
        createdAt: {
          gte: start,
          lte: end,
        },
      }),
    }),
  ]);

  const approvalRate =
    totalApplications > 0 ? (approvedLoans / totalApplications) * 100 : 0;

  // Previous period for comparison
  const [prevApprovedLoans, prevTotalApplications] = await Promise.all([
    prisma.loan.count({
      where: combineWhere(baseLoanWhere, {
        fileStatus: "ACTIVE",
        disbursedDate: {
          gte: previousStart,
          lte: previousEnd,
        },
      }),
    }),
    prisma.loan.count({
      where: combineWhere(baseLoanWhere, {
        createdAt: {
          gte: previousStart,
          lte: previousEnd,
        },
      }),
    }),
  ]);

  const prevApprovalRate =
    prevTotalApplications > 0
      ? (prevApprovedLoans / prevTotalApplications) * 100
      : 0;

  return {
    current: {
      totalApplications,
      approvedLoans,
      rejectedLoans,
      approvalRate: round2(approvalRate),
    },
    previous: {
      totalApplications: prevTotalApplications,
      approvedLoans: prevApprovedLoans,
      approvalRate: round2(prevApprovalRate),
    },
    change: {
      applications: totalApplications - prevTotalApplications,
      approvalRate: round2(approvalRate - prevApprovalRate),
    },
  };
};

// Export scope resolver for use in other controllers
exports.resolveScopeFromUser = resolveScope;

// Main enhanced dashboard summary
exports.getEnhancedSummary = async (req, res) => {
  try {
    const scope = await resolveScope(req.user);
    const dateRange = parseDateRange(req);
    const { start, end, previousStart, previousEnd, rangeType } = dateRange;

    const baseLoanWhere = combineWhere(scope.loanWhere);
    const paymentScope = buildPaymentScope(scope);
    const emiScope = buildEmiScope(scope);

    // Current period metrics
    const [
      disbursedCurrent,
      collectedCurrent,
      activeLoans,
      overdueLoans,
      pendingApprovals,
      dpdBuckets,
      npaMetrics,
      collectionEfficiencyCurrent,
      operationalMetrics,
    ] = await Promise.all([
      // Disbursement in current period
      prisma.loan.aggregate({
        where: combineWhere(baseLoanWhere, {
          disbursedDate: {
            gte: start,
            lte: end,
          },
        }),
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),

      // Collection in current period
      prisma.payment.aggregate({
        where: combineWhere(paymentScope, {
          paymentDate: {
            gte: start,
            lte: end,
          },
          status: "PAID",
        }),
        _count: { _all: true },
        _sum: { amount: true },
      }),

      // Active loans
      prisma.loan.count({
        where: combineWhere(baseLoanWhere, {
          isClosed: false,
          fileStatus: { notIn: ACTIVE_EXCLUDE_STATUSES },
        }),
      }),

      // Overdue loans
      prisma.loan.count({
        where: combineWhere(baseLoanWhere, {
          fileStatus: { in: OVERDUE_STATUSES },
        }),
      }),

      // Pending approvals
      prisma.loan.count({
        where: combineWhere(baseLoanWhere, {
          fileStatus: { in: PENDING_APPROVAL_STATUSES },
        }),
      }),

      // DPD buckets
      calculateDPDBuckets(scope, baseLoanWhere),

      // NPA metrics
      calculateNPA(scope, baseLoanWhere),

      // Collection efficiency for current period
      calculateCollectionEfficiency(scope, paymentScope, start, end),

      // Operational metrics
      calculateOperationalMetrics(
        scope,
        baseLoanWhere,
        start,
        end,
        previousStart,
        previousEnd
      ),
    ]);

    // Previous period metrics for comparison
    const [disbursedPrevious, collectedPrevious, collectionEfficiencyPrevious] =
      await Promise.all([
        prisma.loan.aggregate({
          where: combineWhere(baseLoanWhere, {
            disbursedDate: {
              gte: previousStart,
              lte: previousEnd,
            },
          }),
          _count: { _all: true },
          _sum: { totalAmount: true },
        }),
        prisma.payment.aggregate({
          where: combineWhere(paymentScope, {
            paymentDate: {
              gte: previousStart,
              lte: previousEnd,
            },
            status: "PAID",
          }),
          _count: { _all: true },
          _sum: { amount: true },
        }),
        calculateCollectionEfficiency(
          scope,
          paymentScope,
          previousStart,
          previousEnd
        ),
      ]);

    // Calculate changes
    const currentDisbursedAmount = decimalToNumber(
      disbursedCurrent._sum?.totalAmount
    );
    const previousDisbursedAmount = decimalToNumber(
      disbursedPrevious._sum?.totalAmount
    );
    const currentCollectedAmount = decimalToNumber(
      collectedCurrent._sum?.amount
    );
    const previousCollectedAmount = decimalToNumber(
      collectedPrevious._sum?.amount
    );

    const disbursementChange =
      previousDisbursedAmount > 0
        ? ((currentDisbursedAmount - previousDisbursedAmount) /
            previousDisbursedAmount) *
          100
        : 0;

    const collectionChange =
      previousCollectedAmount > 0
        ? ((currentCollectedAmount - previousCollectedAmount) /
            previousCollectedAmount) *
          100
        : 0;

    const response = {
      scope: {
        level: scope.level,
        permissions: scope.permissions,
        meta: {
          ...scope.meta,
          branch: scope.branch,
        },
      },
      dateRange: {
        rangeType,
        current: {
          start: start.toISOString(),
          end: end.toISOString(),
          label: `${format(start, "MMM dd, yyyy")} - ${format(
            end,
            "MMM dd, yyyy"
          )}`,
        },
        previous: {
          start: previousStart.toISOString(),
          end: previousEnd.toISOString(),
          label: `${format(previousStart, "MMM dd, yyyy")} - ${format(
            previousEnd,
            "MMM dd, yyyy"
          )}`,
        },
      },
      kpis: {
        disbursement: {
          current: {
            count: disbursedCurrent._count._all || 0,
            amount: round2(currentDisbursedAmount),
          },
          previous: {
            count: disbursedPrevious._count._all || 0,
            amount: round2(previousDisbursedAmount),
          },
          change: {
            count:
              (disbursedCurrent._count._all || 0) -
              (disbursedPrevious._count._all || 0),
            amount: round2(currentDisbursedAmount - previousDisbursedAmount),
            percentage: round2(disbursementChange),
          },
        },
        collection: {
          current: {
            count: collectedCurrent._count._all || 0,
            amount: round2(currentCollectedAmount),
          },
          previous: {
            count: collectedPrevious._count._all || 0,
            amount: round2(previousCollectedAmount),
          },
          change: {
            count:
              (collectedCurrent._count._all || 0) -
              (collectedPrevious._count._all || 0),
            amount: round2(currentCollectedAmount - previousCollectedAmount),
            percentage: round2(collectionChange),
          },
        },
        collectionEfficiency: {
          current: collectionEfficiencyCurrent,
          previous: collectionEfficiencyPrevious,
          change: {
            efficiency: round2(
              collectionEfficiencyCurrent.efficiency -
                collectionEfficiencyPrevious.efficiency
            ),
          },
        },
        activeLoans,
        overdueLoans,
        pendingApprovals,
      },
      portfolioQuality: {
        dpd: dpdBuckets,
        npa: npaMetrics,
      },
      operational: operationalMetrics,
    };

    return res.status(200).json({ status: 200, data: response });
  } catch (error) {
    console.error("Enhanced dashboard error:", error);
    const status = error.statusCode || 500;
    return res.status(status).json({
      error: error.message || "Failed to fetch enhanced dashboard summary",
    });
  }
};
