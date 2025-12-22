const prisma = require("../lib/prisma");
const {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfDay,
  endOfDay,
  addDays,
  format,
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

const buildActionScope = (scope, branchEmployeeIds = []) => {
  if (scope.level === "ORG") return {};

  if (scope.level === "BRANCH") {
    if (!branchEmployeeIds.length) {
      return { id: { equals: "_no_activity_" } };
    }
    return {
      employeeId: {
        in: branchEmployeeIds,
      },
    };
  }

  return {
    employeeId: scope.employee?.id || "__none__",
  };
};

const mapMonthlyBuckets = (records, dateKey, amountKey) => {
  const buckets = new Map();
  records.forEach((item) => {
    const date = item[dateKey];
    if (!date) return;
    const key = format(startOfMonth(date), "yyyy-MM-01");
    const prev = buckets.get(key) || { count: 0, amount: 0 };
    const amount = decimalToNumber(item[amountKey]);
    buckets.set(key, {
      count: prev.count + 1,
      amount: round2(prev.amount + amount),
    });
  });
  return buckets;
};

exports.getSummary = async (req, res) => {
  try {
    const scope = await resolveScope(req.user);
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const trendStart = subMonths(currentMonthStart, 5);

    const baseLoanWhere = combineWhere(scope.loanWhere);
    const paymentScope = buildPaymentScope(scope);
    const emiScope = buildEmiScope(scope);
    const userScope = buildUserScope(scope);

    const branchEmployeesPromise =
      scope.level === "BRANCH"
        ? prisma.employee.findMany({
            where: {
              branchId: scope.branch?.id,
              isDeleted: false,
            },
            select: { id: true, name: true },
          })
        : Promise.resolve([]);

    const [
      loanOverview,
      activeLoanCount,
      overdueLoanCount,
      pendingApprovalCount,
      disbursedThisMonth,
      collectedThisMonth,
      totalCustomers,
      dueThisWeek,
      statusBreakdown,
      productMix,
      disbursementRecords,
      collectionRecords,
      topEmployeeGroups,
      topBranchGroups,
      topLoans,
      upcomingEmis,
      branchEmployees,
    ] = await Promise.all([
      prisma.loan.aggregate({
        where: baseLoanWhere,
        _count: { _all: true },
        _sum: {
          totalAmount: true,
          totalPaidAmount: true,
          pendingAmount: true,
        },
      }),
      prisma.loan.count({
        where: combineWhere(baseLoanWhere, {
          isClosed: false,
          fileStatus: { notIn: ACTIVE_EXCLUDE_STATUSES },
        }),
      }),
      prisma.loan.count({
        where: combineWhere(baseLoanWhere, {
          fileStatus: { in: OVERDUE_STATUSES },
        }),
      }),
      prisma.loan.count({
        where: combineWhere(baseLoanWhere, {
          fileStatus: { in: PENDING_APPROVAL_STATUSES },
        }),
      }),
      prisma.loan.aggregate({
        where: combineWhere(baseLoanWhere, {
          disbursedDate: {
            gte: currentMonthStart,
            lte: currentMonthEnd,
          },
        }),
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      prisma.payment.aggregate({
        where: combineWhere(paymentScope, {
          paymentDate: {
            gte: currentMonthStart,
            lte: currentMonthEnd,
          },
          status: { in: ["PAID"] },
        }),
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.user.count({
        where: userScope,
      }),
      prisma.eMI.count({
        where: combineWhere(emiScope, {
          status: "UNPAID",
          paymentFor: {
            gte: startOfDay(now),
            lte: endOfDay(addDays(now, 7)),
          },
        }),
      }),
      prisma.loan.groupBy({
        by: ["fileStatus"],
        where: baseLoanWhere,
        _count: { _all: true },
        _sum: {
          pendingAmount: true,
          totalAmount: true,
        },
      }),
      prisma.loan.groupBy({
        by: ["loanTypeId"],
        where: baseLoanWhere,
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      prisma.loan.findMany({
        where: combineWhere(baseLoanWhere, {
          disbursedDate: {
            not: null,
            gte: trendStart,
          },
        }),
        select: {
          disbursedDate: true,
          totalAmount: true,
        },
      }),
      prisma.payment.findMany({
        where: combineWhere(paymentScope, {
          paymentDate: {
            gte: trendStart,
          },
          status: { in: ["PAID"] },
        }),
        select: {
          paymentDate: true,
          amount: true,
        },
      }),
      scope.level === "SELF"
        ? Promise.resolve([])
        : prisma.loan.groupBy({
            by: ["employeeId"],
            where: combineWhere(baseLoanWhere, {
              employeeId: { not: null },
            }),
            _count: { _all: true },
            _sum: {
              totalPaidAmount: true,
              pendingAmount: true,
            },
            orderBy: {
              _sum: { totalPaidAmount: "desc" },
            },
            take: 5,
          }),
      scope.level === "ORG"
        ? prisma.loan.groupBy({
            by: ["branchId"],
            where: baseLoanWhere,
            _count: { _all: true },
            _sum: {
              totalPaidAmount: true,
              pendingAmount: true,
            },
            orderBy: {
              _sum: { totalPaidAmount: "desc" },
            },
            take: 5,
          })
        : Promise.resolve([]),
      prisma.loan.findMany({
        where: baseLoanWhere,
        orderBy: {
          pendingAmount: "desc",
        },
        take: 5,
        select: {
          id: true,
          fileNo: true,
          pendingAmount: true,
          totalPaidAmount: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
          branch: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.eMI.findMany({
        where: combineWhere(emiScope, {
          status: "UNPAID",
          paymentFor: {
            gte: startOfDay(now),
            lte: endOfDay(addDays(now, 14)),
          },
        }),
        orderBy: {
          paymentFor: "asc",
        },
        take: 6,
        select: {
          id: true,
          paymentFor: true,
          emiPayAmount: true,
          loan: {
            select: {
              id: true,
              fileNo: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
              branch: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      branchEmployeesPromise,
    ]);

    const branchEmployeeIds = branchEmployees.map((e) => e.id);

    const recentActivities = await prisma.actionLog.findMany({
      where: buildActionScope(scope, branchEmployeeIds),
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      select: {
        id: true,
        action: true,
        table: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            name: true,
          },
        },
        admin: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const totalLoans = loanOverview?._count?._all || 0;
    const totalDisbursedAmount = round2(
      decimalToNumber(loanOverview?._sum?.totalAmount)
    );
    const totalCollectedAmount = round2(
      decimalToNumber(loanOverview?._sum?.totalPaidAmount)
    );
    const totalPendingAmount = round2(
      decimalToNumber(loanOverview?._sum?.pendingAmount)
    );

    const disbursedMonthAmount = round2(
      decimalToNumber(disbursedThisMonth?._sum?.totalAmount)
    );
    const collectedMonthAmount = round2(
      decimalToNumber(collectedThisMonth?._sum?.amount)
    );

    const statusBreakdownData = statusBreakdown
      .map((item) => ({
        status: item.fileStatus,
        count: item._count?._all || 0,
        pendingAmount: round2(decimalToNumber(item._sum?.pendingAmount)),
        totalAmount: round2(decimalToNumber(item._sum?.totalAmount)),
      }))
      .sort((a, b) => b.count - a.count);

    const loanTypeIds = productMix
      .map((item) => item.loanTypeId)
      .filter(Boolean);
    const loanTypes = loanTypeIds.length
      ? await prisma.loanType.findMany({
          where: { id: { in: loanTypeIds } },
          select: {
            id: true,
            label: true,
            name: true,
          },
        })
      : [];
    const loanTypeLabelMap = new Map(
      loanTypes.map((lt) => [lt.id, lt.label || lt.name])
    );
    const totalProductAmount = productMix.reduce((acc, item) => {
      return acc + decimalToNumber(item._sum?.totalAmount);
    }, 0);

    const productMixData = productMix
      .map((item) => {
        const amount = decimalToNumber(item._sum?.totalAmount);
        return {
          loanTypeId: item.loanTypeId,
          loanTypeName:
            loanTypeLabelMap.get(item.loanTypeId) || "Uncategorized",
          count: item._count?._all || 0,
          amount: round2(amount),
          share: totalProductAmount
            ? round2((amount / totalProductAmount) * 100)
            : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const disbursementBuckets = mapMonthlyBuckets(
      disbursementRecords,
      "disbursedDate",
      "totalAmount"
    );
    const collectionBuckets = mapMonthlyBuckets(
      collectionRecords,
      "paymentDate",
      "amount"
    );

    const monthlyTrend = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const monthDate = subMonths(currentMonthStart, offset);
      const key = format(monthDate, "yyyy-MM-01");
      const disb = disbursementBuckets.get(key) || { count: 0, amount: 0 };
      const coll = collectionBuckets.get(key) || { count: 0, amount: 0 };
      monthlyTrend.push({
        month: monthDate.toISOString(),
        label: format(monthDate, "MMM yyyy"),
        disbursedCount: disb.count,
        disbursedAmount: round2(disb.amount),
        collectedCount: coll.count,
        collectedAmount: round2(coll.amount),
      });
    }

    const monthlyDisbursement = monthlyTrend.map((item) => ({
      month: item.month,
      label: item.label,
      count: item.disbursedCount,
      amount: item.disbursedAmount,
    }));

    const topEmployees =
      scope.level === "SELF"
        ? []
        : await (async () => {
            const employeeIds = [
              ...new Set(topEmployeeGroups.map((item) => item.employeeId)),
            ].filter(Boolean);
            if (!employeeIds.length) return [];
            const employees = await prisma.employee.findMany({
              where: { id: { in: employeeIds } },
              select: {
                id: true,
                name: true,
                branch: { select: { name: true } },
              },
            });
            const employeeMap = new Map(
              employees.map((emp) => [
                emp.id,
                {
                  name: emp.name,
                  branch: emp.branch?.name || null,
                },
              ])
            );
            return topEmployeeGroups.map((item) => {
              const info = employeeMap.get(item.employeeId) || {
                name: "Unassigned",
                branch: null,
              };
              return {
                employeeId: item.employeeId,
                name: info.name,
                branch: info.branch,
                loanCount: item._count?._all || 0,
                collectedAmount: round2(
                  decimalToNumber(item._sum?.totalPaidAmount)
                ),
                pendingAmount: round2(
                  decimalToNumber(item._sum?.pendingAmount)
                ),
              };
            });
          })();

    const topBranches =
      scope.level === "ORG"
        ? await (async () => {
            const branchIds = [
              ...new Set(topBranchGroups.map((item) => item.branchId)),
            ].filter(Boolean);
            if (!branchIds.length) return [];
            const branches = await prisma.branch.findMany({
              where: { id: { in: branchIds } },
              select: {
                id: true,
                name: true,
                region: { select: { name: true } },
              },
            });
            const branchMap = new Map(
              branches.map((branch) => [
                branch.id,
                {
                  name: branch.name,
                  region: branch.region?.name || null,
                },
              ])
            );
            return topBranchGroups.map((item) => {
              const info = branchMap.get(item.branchId) || {
                name: "Unassigned",
                region: null,
              };
              return {
                branchId: item.branchId,
                name: info.name,
                region: info.region,
                loanCount: item._count?._all || 0,
                collectedAmount: round2(
                  decimalToNumber(item._sum?.totalPaidAmount)
                ),
                pendingAmount: round2(
                  decimalToNumber(item._sum?.pendingAmount)
                ),
              };
            });
          })()
        : [];

    const topCustomers = topLoans.map((loan) => ({
      loanId: loan.id,
      fileNo: loan.fileNo,
      borrower: `${loan.user?.firstName || ""} ${loan.user?.lastName || ""}`
        .trim()
        .replace(/\s+/g, " "),
      phone: loan.user?.phone || null,
      branch: loan.branch?.name || null,
      pendingAmount: round2(decimalToNumber(loan.pendingAmount)),
      collectedAmount: round2(decimalToNumber(loan.totalPaidAmount)),
    }));

    const upcoming = upcomingEmis.map((emi) => ({
      emiId: emi.id,
      dueDate: emi.paymentFor,
      amount: round2(decimalToNumber(emi.emiPayAmount)),
      loanId: emi.loan?.id || null,
      fileNo: emi.loan?.fileNo || null,
      borrower: `${emi.loan?.user?.firstName || ""} ${
        emi.loan?.user?.lastName || ""
      }`
        .trim()
        .replace(/\s+/g, " "),
      branch: emi.loan?.branch?.name || null,
    }));

    const activities = recentActivities.map((activity) => ({
      id: activity.id,
      action: activity.action,
      table: activity.table,
      createdAt: activity.createdAt,
      actor: activity.employee
        ? {
            type: "EMPLOYEE",
            id: activity.employee.id,
            name: activity.employee.name,
          }
        : activity.admin
        ? {
            type: "ADMIN",
            id: activity.admin.id,
            name: activity.admin.name,
          }
        : null,
    }));

    const summary = {
      scope: {
        level: scope.level,
        permissions: scope.permissions,
        meta: {
          ...scope.meta,
          branch: scope.branch,
        },
      },
      kpis: {
        totalLoans,
        totalCustomers,
        totalActiveLoans: activeLoanCount,
        totalPendingApprovalLoans: pendingApprovalCount,
        totalOverdueLoans: overdueLoanCount,
        totalDisbursed: totalDisbursedAmount,
        totalCollected: totalCollectedAmount,
        totalPending: totalPendingAmount,
        disbursedThisMonth: {
          count: disbursedThisMonth?._count?._all || 0,
          amount: disbursedMonthAmount,
        },
        collectedThisMonth: {
          count: collectedThisMonth?._count?._all || 0,
          amount: collectedMonthAmount,
        },
        dueInNextSevenDays: dueThisWeek,
      },
      charts: {
        monthlyTrend,
        monthlyDisbursement,
        statusBreakdown: statusBreakdownData,
        productMix: productMixData,
      },
      lists: {
        topEmployees,
        topBranches,
        topCustomers,
        upcomingEmis: upcoming,
        recentActivities: activities,
      },
    };

    return res.status(200).json({ status: 200, data: summary });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    const status = error.statusCode || 500;
    return res
      .status(status)
      .json({ error: error.message || "Failed to fetch dashboard summary" });
  }
};
