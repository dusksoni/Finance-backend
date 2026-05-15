// controllers/legalAction.controller.js
// SARFAESI / DRT legal action workflow

const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// SARFAESI stage progression:
// NPA → NOTICE_SENT (13(2)) → COURT_FILED (DRT/SARFAESI 13(4)) → DECREE_OBTAINED → EXECUTION_PROCEEDING → SETTLED_OUT_OF_COURT | WITHDRAWN

const STAGE_ORDER = [
  "NONE",
  "NOTICE_SENT",
  "COURT_FILED",
  "DECREE_OBTAINED",
  "EXECUTION_PROCEEDING",
  "SETTLED_OUT_OF_COURT",
  "WITHDRAWN",
];

// ─── List legal actions ───────────────────────────────────────────────────────
exports.listLegalActions = async (req, res) => {
  try {
    const { stage, loanId, page = 1, limit = 50 } = req.query;
    const { getBranchFilter } = require("../utils/regionFilter");
    const regionBranchFilter = loanId ? null : getBranchFilter(req.user);
    const where = {};
    if (stage) where.stage = stage;
    if (loanId) where.loanId = loanId;
    else if (regionBranchFilter) where.loan = regionBranchFilter;

    const [actions, total] = await Promise.all([
      prisma.legalAction.findMany({
        where,
        include: {
          loan: {
            select: {
              id: true, fileNo: true, fileStatus: true, principalLoanAmount: true,
              user: { select: { firstName: true, lastName: true, phone: true } },
              branch: { select: { name: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.legalAction.count({ where }),
    ]);

    res.json({ data: actions, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: "Failed to list legal actions", message: err.message });
  }
};

// ─── Get legal action by loan ─────────────────────────────────────────────────
exports.getLegalActionByLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const action = await prisma.legalAction.findFirst({
      where: { loanId },
      include: {
        loan: {
          select: {
            id: true, fileNo: true, fileStatus: true, principalLoanAmount: true, pendingAmount: true,
            user: { select: { firstName: true, lastName: true, phone: true } },
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: action || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to get legal action", message: err.message });
  }
};

// ─── Initiate SARFAESI / legal action ────────────────────────────────────────
exports.createLegalAction = async (req, res) => {
  try {
    const { loanId, stage, noticeDate, notes, lawyerName, lawyerContact, caseNumber, court, fileId } = req.body;

    if (!loanId) return res.status(400).json({ error: "loanId is required" });

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    // Only one active legal action per loan
    const existing = await prisma.legalAction.findFirst({ where: { loanId } });
    if (existing) return res.status(409).json({ error: "Legal action already exists for this loan. Use PATCH to update stage." });

    const action = await prisma.legalAction.create({
      data: {
        loanId,
        stage: stage || "NOTICE_SENT",
        noticeDate: noticeDate ? new Date(noticeDate) : new Date(),
        notes,
        lawyerName,
        lawyerContact,
        caseNumber,
        court,
        fileId,
        createdByAdminId: req.user?.adminId,
        createdByEmployeeId: req.user?.employeeId,
      },
    });

    // Update loan status to LEGAL_ACTION
    await prisma.loan.update({ where: { id: loanId }, data: { fileStatus: "LEGAL_ACTION" } });

    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: `LEGAL ACTION INITIATED: ${action.stage}`,
      table: "LegalAction",
      targetId: action.id,
      metadata: { loanId, stage: action.stage },
    });

    res.status(201).json({ message: "Legal action created", data: action });
  } catch (err) {
    res.status(500).json({ error: "Failed to create legal action", message: err.message });
  }
};

// ─── Advance stage ────────────────────────────────────────────────────────────
exports.updateLegalAction = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      stage, noticeDate, filingDate, caseNumber, court,
      decreeDate, decreeAmount, nextHearingDate,
      notes, lawyerName, lawyerContact, fileId,
    } = req.body;

    const existing = await prisma.legalAction.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Legal action not found" });

    const data = {};
    if (stage) data.stage = stage;
    if (noticeDate) data.noticeDate = new Date(noticeDate);
    if (filingDate) data.filingDate = new Date(filingDate);
    if (caseNumber) data.caseNumber = caseNumber;
    if (court) data.court = court;
    if (decreeDate) data.decreeDate = new Date(decreeDate);
    if (decreeAmount !== undefined) data.decreeAmount = decreeAmount;
    if (nextHearingDate) data.nextHearingDate = new Date(nextHearingDate);
    if (notes !== undefined) data.notes = notes;
    if (lawyerName !== undefined) data.lawyerName = lawyerName;
    if (lawyerContact !== undefined) data.lawyerContact = lawyerContact;
    if (fileId !== undefined) data.fileId = fileId;
    data.updatedByAdminId = req.user?.adminId;

    const updated = await prisma.legalAction.update({ where: { id }, data });

    // Sync loan status for terminal stages
    if (stage === "SETTLED_OUT_OF_COURT") {
      await prisma.loan.update({ where: { id: existing.loanId }, data: { fileStatus: "SETTLED" } });
    } else if (stage === "WITHDRAWN") {
      await prisma.loan.update({ where: { id: existing.loanId }, data: { fileStatus: "DEFAULTED" } });
    }

    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: `LEGAL ACTION UPDATED: ${updated.stage}`,
      table: "LegalAction",
      targetId: id,
      metadata: { loanId: existing.loanId, stage: updated.stage },
    });

    res.json({ message: "Legal action updated", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update legal action", message: err.message });
  }
};

// ─── Summary stats ────────────────────────────────────────────────────────────
exports.getLegalSummary = async (req, res) => {
  try {
    const stageCounts = await prisma.legalAction.groupBy({
      by: ["stage"],
      _count: { _all: true },
    });
    const total = await prisma.legalAction.count();
    const decreeTotal = await prisma.legalAction.aggregate({ _sum: { decreeAmount: true } });

    res.json({
      data: {
        total,
        byStage: Object.fromEntries(stageCounts.map((s) => [s.stage, s._count._all])),
        totalDecreeAmount: decreeTotal._sum.decreeAmount || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get legal summary", message: err.message });
  }
};
