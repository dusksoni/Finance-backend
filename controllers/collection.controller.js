const prisma = require("../lib/prisma");
const { addDays, isBefore } = require("date-fns");
const logAction = require("../utils/adminLogger");
const { buildCollectionSummaryFromEmis } = require("../utils/collectionCase");
const { getCollectionPolicy } = require("../utils/loanTypeRules");
const { notifyCreator } = require("../utils/notifyRegional");
const { getBranchFilter } = require("../utils/regionFilter");
const { pushInApp } = require("../utils/notificationService");

const ACTIVE_CASE_STATUSES = ["OPEN", "IN_PROGRESS", "PROMISE_TO_PAY", "BROKEN_PROMISE"];

const buildActorFields = (req, prefix = "created") => ({
  [`${prefix}ByAdminId`]: req.user?.adminId || null,
  [`${prefix}ByEmployeeId`]: req.user?.employeeId || null,
});

const buildOverdueCaseSeed = async (loan, req = null) => {
  const overdueEmis = await prisma.eMI.findMany({
    where: {
      loanId: loan.id,
      status: { in: ["UNPAID", "PARTIAL"] },
      paymentFor: { lte: new Date() },
    },
    select: {
      id: true,
      paymentFor: true,
      emiPayAmount: true,
      amountPaidSoFar: true,
      finePaid: true,
      fineAmount: true,
    },
    orderBy: { paymentFor: "asc" },
  });

  const policy = getCollectionPolicy(loan.loanType?.rules);
  const summary = buildCollectionSummaryFromEmis(overdueEmis, new Date(), loan.loanType?.rules);
  return {
    branchId: loan.branchId || null,
    bucket: summary.bucket,
    dpd: summary.dpd,
    priority: summary.priority,
    overdueEmiCount: summary.overdueEmiCount,
    overdueAmount: summary.overdueAmount,
    overdueFineAmount: summary.overdueFineAmount,
    totalDue: summary.totalDue,
    oldestDueDate: summary.oldestDueDate,
    metadata: {
      loanFileNo: loan.fileNo,
      synchronizedAt: new Date().toISOString(),
      collectionPolicy: policy,
    },
    ...(req ? buildActorFields(req, "created") : {}),
  };
};

const getAutoAssignableEmployee = async (branchId) => {
  if (!branchId) return null;

  return prisma.employee.findFirst({
    where: {
      branchId,
      isDeleted: false,
      isBlocked: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });
};

exports.syncOverdueCollectionCases = async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      where: {
        fileStatus: { in: ["ACTIVE", "OVERDUE", "DEFAULTED", "UNDER_COLLECTION"] },
      },
      select: {
        id: true,
        fileNo: true,
        branchId: true,
        loanType: {
          select: {
            rules: true,
          },
        },
      },
    });

    let created = 0;
    let updated = 0;
    let closed = 0;

    for (const loan of loans) {
      const collectionPolicy = getCollectionPolicy(loan.loanType?.rules);
      const payload = await buildOverdueCaseSeed(loan, req);
      const existing = await prisma.collectionCase.findFirst({
        where: {
          loanId: loan.id,
          status: { in: ACTIVE_CASE_STATUSES },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!collectionPolicy.autoCreateOnOverdue) {
        if (existing) {
          await prisma.collectionCase.update({
            where: { id: existing.id },
            data: {
              status: "RESOLVED",
              resolutionType: "AUTO_SYNC_DISABLED_BY_POLICY",
              ...buildActorFields(req, "closed"),
            },
          });
          closed += 1;
        }
        continue;
      }

      if (payload.dpd <= 0 || payload.overdueEmiCount <= 0 || payload.totalDue <= 0) {
        if (existing) {
          await prisma.collectionCase.update({
            where: { id: existing.id },
            data: {
              status: "RESOLVED",
              resolutionType: "AUTO_SYNC_CLOSED",
              ...buildActorFields(req, "closed"),
            },
          });
          closed += 1;
        }
        continue;
      }

      const isBrokenPromise =
        existing?.status === "PROMISE_TO_PAY" &&
        existing.latestPromiseDate &&
        isBefore(addDays(new Date(existing.latestPromiseDate), collectionPolicy.promiseToPayGraceDays), new Date());

      let autoAssignee = null;
      if (!existing?.assignedToEmployeeId && collectionPolicy.autoAssignToBranchEmployee) {
        autoAssignee = await getAutoAssignableEmployee(payload.branchId);
      }

      if (existing) {
        await prisma.collectionCase.update({
          where: { id: existing.id },
          data: {
            branchId: payload.branchId,
            bucket: payload.bucket,
            dpd: payload.dpd,
            priority: payload.priority,
            overdueEmiCount: payload.overdueEmiCount,
            overdueAmount: payload.overdueAmount,
            overdueFineAmount: payload.overdueFineAmount,
            totalDue: payload.totalDue,
            oldestDueDate: payload.oldestDueDate,
            metadata: payload.metadata,
            status: isBrokenPromise ? "BROKEN_PROMISE" : existing.status,
            ...(autoAssignee
              ? {
                  assignedToEmployeeId: autoAssignee.id,
                  ...buildActorFields(req, "assigned"),
                }
              : {}),
          },
        });
        updated += 1;
      } else {
        await prisma.collectionCase.create({
          data: {
            loanId: loan.id,
            ...payload,
            ...(autoAssignee
              ? {
                  assignedToEmployeeId: autoAssignee.id,
                  ...buildActorFields(req, "assigned"),
                }
              : {}),
          },
        });
        created += 1;
      }
    }

    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "SYNCED_COLLECTION_CASES",
      table: "CollectionCase",
      metadata: { created, updated, closed },
    });

    return res.json({
      status: 200,
      message: "Collection cases synchronized successfully",
      data: { created, updated, closed },
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to synchronize collection cases",
      message: error.message,
    });
  }
};

exports.listCollectionCases = async (req, res) => {
  try {
    const {
      status,
      bucket,
      priority,
      assignedToEmployeeId,
      branchId,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const parsedPage = Number(page) || 1;
    const parsedLimit = Number(limit) || 20;

    const valid = (v) => v && v !== "undefined" && v !== "null";
    // Apply regional scope if no explicit branchId provided
    const branchRegionFilter = valid(branchId) ? null : getBranchFilter(req.user);
    const where = {
      ...(valid(status) ? { status: String(status) } : {}),
      ...(valid(bucket) ? { bucket: String(bucket) } : {}),
      ...(valid(priority) ? { priority: String(priority) } : {}),
      ...(valid(assignedToEmployeeId) ? { assignedToEmployeeId: String(assignedToEmployeeId) } : {}),
      ...(valid(branchId) ? { branchId: String(branchId) } : {}),
      ...(branchRegionFilter || {}),
      ...(search
        ? {
            loan: {
              fileNo: {
                contains: String(search),
                mode: "insensitive",
              },
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.collectionCase.findMany({
        where,
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit,
        orderBy: [{ dpd: "desc" }, { updatedAt: "desc" }],
        include: {
          loan: {
            select: {
              id: true,
              fileNo: true,
              fileStatus: true,
              pendingAmount: true,
              user: { select: { id: true, firstName: true, lastName: true, phone: true } },
            },
          },
          branch: { select: { id: true, name: true } },
          assignedToEmployee: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.collectionCase.count({ where }),
    ]);

    return res.json({
      status: 200,
      data,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch collection cases",
      message: error.message,
    });
  }
};

exports.getCollectionSummary = async (req, res) => {
  try {
    const { branchId, assignedToEmployeeId, status } = req.query;
    const valid = (v) => v && v !== "undefined" && v !== "null";
    const where = {
      ...(valid(branchId) ? { branchId: String(branchId) } : {}),
      ...(valid(assignedToEmployeeId) ? { assignedToEmployeeId: String(assignedToEmployeeId) } : {}),
      ...(valid(status) ? { status: String(status) } : {}),
    };

    const cases = await prisma.collectionCase.findMany({
      where,
      select: {
        id: true,
        status: true,
        bucket: true,
        priority: true,
        totalDue: true,
        overdueAmount: true,
        overdueFineAmount: true,
        assignedToEmployeeId: true,
        latestPromiseDate: true,
        nextActionAt: true,
      },
    });

    const summary = cases.reduce(
      (acc, collectionCase) => {
        const statusKey = collectionCase.status || "UNKNOWN";
        const bucketKey = collectionCase.bucket || "UNKNOWN";
        const priorityKey = collectionCase.priority || "UNKNOWN";

        acc.totalCases += 1;
        acc.totalDue += Number(collectionCase.totalDue || 0);
        acc.overdueAmount += Number(collectionCase.overdueAmount || 0);
        acc.overdueFineAmount += Number(collectionCase.overdueFineAmount || 0);

        acc.byStatus[statusKey] = (acc.byStatus[statusKey] || 0) + 1;
        acc.byBucket[bucketKey] = (acc.byBucket[bucketKey] || 0) + 1;
        acc.byPriority[priorityKey] = (acc.byPriority[priorityKey] || 0) + 1;

        if (!collectionCase.assignedToEmployeeId) acc.unassignedCases += 1;
        if (collectionCase.status === "PROMISE_TO_PAY") acc.promiseToPayCases += 1;
        if (collectionCase.status === "BROKEN_PROMISE") acc.brokenPromiseCases += 1;
        if (
          collectionCase.nextActionAt &&
          isBefore(new Date(collectionCase.nextActionAt), new Date())
        ) {
          acc.overdueFollowUps += 1;
        }

        return acc;
      },
      {
        totalCases: 0,
        totalDue: 0,
        overdueAmount: 0,
        overdueFineAmount: 0,
        unassignedCases: 0,
        promiseToPayCases: 0,
        brokenPromiseCases: 0,
        overdueFollowUps: 0,
        byStatus: {},
        byBucket: {},
        byPriority: {},
      }
    );

    return res.json({
      status: 200,
      data: {
        ...summary,
        totalDue: Number(summary.totalDue.toFixed(2)),
        overdueAmount: Number(summary.overdueAmount.toFixed(2)),
        overdueFineAmount: Number(summary.overdueFineAmount.toFixed(2)),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch collection summary",
      message: error.message,
    });
  }
};

exports.getCollectionCaseById = async (req, res) => {
  try {
    const collectionCase = await prisma.collectionCase.findUnique({
      where: { id: req.params.id },
      include: {
        loan: {
          select: {
            id: true,
            fileNo: true,
            fileStatus: true,
            pendingAmount: true,
            user: { select: { id: true, firstName: true, lastName: true, phone: true } },
          },
        },
        branch: { select: { id: true, name: true } },
        assignedToEmployee: { select: { id: true, name: true, email: true } },
        actions: {
          orderBy: { contactAt: "desc" },
          include: {
            createdByAdmin: { select: { id: true, name: true } },
            createdByEmployee: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!collectionCase) {
      return res.status(404).json({
        status: 404,
        error: "Collection case not found",
      });
    }

    return res.json({
      status: 200,
      data: collectionCase,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch collection case",
      message: error.message,
    });
  }
};

exports.assignCollectionCase = async (req, res) => {
  try {
    const { assignedToEmployeeId, nextActionAt, notes } = req.body || {};
    if (!assignedToEmployeeId) {
      return res.status(400).json({ status: 400, error: "assignedToEmployeeId is required" });
    }

    const updated = await prisma.collectionCase.update({
      where: { id: req.params.id },
      data: {
        assignedToEmployeeId,
        nextActionAt: nextActionAt ? new Date(nextActionAt) : undefined,
        notes: notes ?? undefined,
        status: "IN_PROGRESS",
        ...buildActorFields(req, "assigned"),
      },
    });

    // Notify the assigned employee
    pushInApp({ targetType: "EMPLOYEE", targetId: assignedToEmployeeId, title: "Collection Case Assigned", message: `A collection case has been assigned to you`, triggerEvent: "COLLECTION_ASSIGNED", linkUrl: `/collections/${req.params.id}` }).catch(() => {});

    return res.json({
      status: 200,
      message: "Collection case assigned successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to assign collection case",
      message: error.message,
    });
  }
};

exports.updateCollectionCaseStatus = async (req, res) => {
  try {
    const { status, notes, resolutionType, nextActionAt } = req.body || {};
    if (!status) {
      return res.status(400).json({ status: 400, error: "status is required" });
    }

    const updated = await prisma.collectionCase.update({
      where: { id: req.params.id },
      data: {
        status,
        notes: notes ?? undefined,
        resolutionType: resolutionType ?? undefined,
        nextActionAt: nextActionAt ? new Date(nextActionAt) : undefined,
        ...(status === "CLOSED" || status === "RESOLVED" ? buildActorFields(req, "closed") : {}),
      },
    });

    return res.json({
      status: 200,
      message: "Collection case updated successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to update collection case",
      message: error.message,
    });
  }
};

exports.addCollectionAction = async (req, res) => {
  try {
    const { actionType, outcome, notes, nextActionAt, promiseDate, promiseAmount, metadata } = req.body || {};
    if (!actionType) {
      return res.status(400).json({ status: 400, error: "actionType is required" });
    }

    const collectionCase = await prisma.collectionCase.findUnique({
      where: { id: req.params.id },
      include: {
        loan: {
          select: {
            loanType: {
              select: {
                rules: true,
              },
            },
          },
        },
      },
    });

    if (!collectionCase) {
      return res.status(404).json({ status: 404, error: "Collection case not found" });
    }

    const collectionPolicy = getCollectionPolicy(collectionCase.loan?.loanType?.rules);
    const computedNextActionAt = nextActionAt
      ? new Date(nextActionAt)
      : promiseDate
        ? new Date(promiseDate)
        : addDays(new Date(), collectionPolicy.followUpAfterActionDays);

    const action = await prisma.collectionAction.create({
      data: {
        caseId: req.params.id,
        actionType,
        outcome: outcome || null,
        notes: notes || null,
        nextActionAt: computedNextActionAt,
        promiseDate: promiseDate ? new Date(promiseDate) : null,
        promiseAmount: promiseAmount ?? null,
        metadata: metadata || null,
        ...buildActorFields(req, "created"),
      },
      include: {
        createdByAdmin: { select: { id: true, name: true } },
        createdByEmployee: { select: { id: true, name: true } },
      },
    });

    const caseStatus =
      actionType === "PROMISE_TO_PAY" || promiseDate
        ? "PROMISE_TO_PAY"
        : ["OPEN", "BROKEN_PROMISE"].includes(collectionCase.status)
          ? "IN_PROGRESS"
          : undefined;

    await prisma.collectionCase.update({
      where: { id: req.params.id },
      data: {
        lastContactAt: action.contactAt,
        nextActionAt: action.nextActionAt || undefined,
        latestPromiseDate: action.promiseDate || undefined,
        latestPromiseAmount: action.promiseAmount || undefined,
        ...(caseStatus ? { status: caseStatus } : {}),
      },
    });

    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "ADDED_COLLECTION_ACTION",
      table: "CollectionAction",
      targetId: action.id,
      metadata: {
        caseId: req.params.id,
        actionType,
      },
    });

    return res.status(201).json({
      status: 201,
      message: "Collection action added successfully",
      data: action,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to add collection action",
      message: error.message,
    });
  }
};

// ─── Collection Effectiveness Metrics ────────────────────────────────────────

exports.getEffectivenessMetrics = async (req, res) => {
  try {
    const { fromDate, toDate, branchId } = req.query;
    const from = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = toDate ? new Date(toDate) : new Date();

    const where = { createdAt: { gte: from, lte: to } };
    if (branchId) where.branchId = branchId;

    const [total, resolved, brokenPTP, ptpKept, avgDPD] = await Promise.all([
      prisma.collectionCase.count({ where }),
      prisma.collectionCase.count({ where: { ...where, status: { in: ["RESOLVED", "CLOSED"] } } }),
      prisma.collectionCase.count({ where: { ...where, status: "BROKEN_PROMISE" } }),
      prisma.promiseToPay.count({ where: { createdAt: { gte: from, lte: to }, status: "KEPT" } }),
      prisma.collectionCase.aggregate({ where, _avg: { dpd: true } }),
    ]);

    const bucketBreakdown = await prisma.collectionCase.groupBy({
      by: ["bucket"],
      where,
      _count: { id: true },
    });

    const resolutionRate = total > 0 ? Math.round((resolved / total) * 10000) / 100 : 0;
    const brokenPTPRate = total > 0 ? Math.round((brokenPTP / total) * 10000) / 100 : 0;

    res.json({
      data: {
        period: { from, to },
        totalCases: total,
        resolvedCases: resolved,
        resolutionRate: `${resolutionRate}%`,
        brokenPTPCases: brokenPTP,
        brokenPTPRate: `${brokenPTPRate}%`,
        ptpKept,
        averageDPD: Math.round(avgDPD._avg.dpd || 0),
        bucketBreakdown: bucketBreakdown.reduce((acc, b) => {
          acc[b.bucket] = b._count.id;
          return acc;
        }, {}),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch collection metrics", message: err.message });
  }
};
