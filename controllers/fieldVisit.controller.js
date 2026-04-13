// controllers/fieldVisit.controller.js
// Field visit recording — GPS coordinates + photo proof for collection officers
// Mobile app uses this when recording a collection action in the field

const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Record field visit ───────────────────────────────────────────────────
// A field visit is always tied to a CollectionCase. If no caseId passed,
// we look up the active case for this loan automatically.
exports.recordFieldVisit = async (req, res) => {
  try {
    const {
      collectionCaseId,
      loanId,
      latitude,
      longitude,
      address,
      visitType = "VISIT",    // VISIT, CALL, WHATSAPP, NOTICE, OTHER
      outcome,                // free text: PAYMENT_COLLECTED, PTP_GIVEN, NOT_AVAILABLE, REFUSED
      notes,
      photoUrl,               // Cloudinary URL of proof photo
      amountCollected,
      ptpDate,
      ptpAmount,
      nextActionAt,
    } = req.body;

    if (!loanId && !collectionCaseId)
      return res.status(400).json({ error: "loanId or collectionCaseId is required" });

    // Resolve collection case
    let caseId = collectionCaseId;
    let resolvedLoanId = loanId;

    if (!caseId && loanId) {
      const existing = await prisma.collectionCase.findFirst({
        where: { loanId, status: { in: ["OPEN", "IN_PROGRESS", "PROMISE_TO_PAY", "BROKEN_PROMISE"] } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        caseId = existing.id;
      } else {
        return res.status(404).json({ error: "No active collection case found for this loan" });
      }
    }

    if (!resolvedLoanId && caseId) {
      const c = await prisma.collectionCase.findUnique({ where: { id: caseId }, select: { loanId: true } });
      resolvedLoanId = c?.loanId;
    }

    const metadata = {
      gps: latitude && longitude ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) } : null,
      address: address || null,
      photoUrl: photoUrl || null,
      amountCollected: amountCollected ? parseFloat(amountCollected) : null,
      isFieldVisit: true,
    };

    const action = await prisma.collectionAction.create({
      data: {
        caseId,
        actionType: visitType,
        outcome: outcome || null,
        notes: notes || null,
        contactAt: new Date(),
        nextActionAt: nextActionAt ? new Date(nextActionAt) : null,
        promiseDate: ptpDate ? new Date(ptpDate) : null,
        promiseAmount: ptpAmount ? parseFloat(ptpAmount) : null,
        metadata,
        createdByAdminId: req.user.adminId || null,
        createdByEmployeeId: req.user.employeeId || null,
      },
    });

    // If PTP given, create PromiseToPay record
    if (ptpDate && ptpAmount) {
      await prisma.promiseToPay.create({
        data: {
          caseId,
          loanId: resolvedLoanId,
          promiseDate: new Date(ptpDate),
          promiseAmount: parseFloat(ptpAmount),
          createdByAdminId: req.user.adminId || null,
          createdByEmployeeId: req.user.employeeId || null,
        },
      });
    }

    // Update case lastContactAt
    await prisma.collectionCase.update({
      where: { id: caseId },
      data: {
        lastContactAt: new Date(),
        ...(ptpDate && { latestPromiseDate: new Date(ptpDate), status: "PROMISE_TO_PAY" }),
        ...(nextActionAt && { nextActionAt: new Date(nextActionAt) }),
      },
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.activity,
      action: "FIELD_VISIT_RECORDED",
      table: "CollectionAction",
      targetId: action.id,
      metadata: { loanId: resolvedLoanId, outcome, hasGPS: !!latitude, hasPhoto: !!photoUrl },
    });

    res.status(201).json({ message: "Field visit recorded", data: action });
  } catch (err) {
    res.status(500).json({ error: "Failed to record field visit", message: err.message });
  }
};

// ─── List field visits for a collection case ──────────────────────────────
exports.listFieldVisits = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { caseId };

    const [visits, total] = await Promise.all([
      prisma.collectionAction.findMany({
        where,
        include: {
          createdByAdmin: { select: { firstName: true, lastName: true } },
          createdByEmployee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { contactAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.collectionAction.count({ where }),
    ]);

    res.json({ data: visits, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to list field visits", message: err.message });
  }
};

// ─── My visits today (field officer daily view) ───────────────────────────
exports.myVisitsToday = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isEmployee = !!req.user.employeeId;

    const visits = await prisma.collectionAction.findMany({
      where: {
        contactAt: { gte: today, lt: tomorrow },
        ...(isEmployee
          ? { createdByEmployeeId: req.user.employeeId }
          : { createdByAdminId: req.user.adminId }),
      },
      include: {
        collectionCase: {
          include: {
            loan: {
              select: {
                fileNo: true,
                user: { select: { firstName: true, lastName: true, mobileNumber: true } },
              },
            },
          },
        },
      },
      orderBy: { contactAt: "desc" },
    });

    const fieldVisits = visits.filter((v) => v.metadata?.isFieldVisit);

    res.json({
      data: fieldVisits,
      all: visits,
      summary: {
        total: fieldVisits.length,
        ptpGiven: fieldVisits.filter((v) => v.promiseDate).length,
        totalAmountPromised: fieldVisits.reduce((sum, v) => sum + Number(v.promiseAmount || 0), 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get today's visits", message: err.message });
  }
};
