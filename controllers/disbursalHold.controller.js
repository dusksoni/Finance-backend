const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

exports.placeHold = async (req, res) => {
  try {
    const { loanId, reason, holdType, expiresAt, metadata } = req.body;

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    // Check for existing active hold
    const existing = await prisma.disbursalHold.findFirst({ where: { loanId, status: "ACTIVE" } });
    if (existing) return res.status(409).json({ error: "An active disbursal hold already exists for this loan", data: existing });

    const hold = await prisma.disbursalHold.create({
      data: {
        loanId, reason, holdType,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        metadata,
        placedByAdminId: req.user.adminId,
        placedByEmployeeId: req.user.employeeId,
      },
    });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "DISBURSAL_HOLD_PLACED", table: "DisbursalHold", targetId: hold.id, metadata: { loanId, reason } });
    res.status(201).json({ message: "Disbursal hold placed", data: hold });
  } catch (err) {
    res.status(500).json({ error: "Failed to place hold", message: err.message });
  }
};

exports.listHolds = async (req, res) => {
  try {
    const { loanId, status, holdType } = req.query;
    const where = {};
    if (loanId) where.loanId = loanId;
    if (status) where.status = status;
    if (holdType) where.holdType = holdType;
    const holds = await prisma.disbursalHold.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: holds });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch disbursal holds" });
  }
};

exports.releaseHold = async (req, res) => {
  try {
    const { releaseNote } = req.body;
    const hold = await prisma.disbursalHold.findUnique({ where: { id: req.params.id } });
    if (!hold) return res.status(404).json({ error: "Hold not found" });
    if (hold.status !== "ACTIVE") return res.status(400).json({ error: "Hold is not active" });

    const updated = await prisma.disbursalHold.update({
      where: { id: req.params.id },
      data: {
        status: "RELEASED",
        releaseNote,
        releasedAt: new Date(),
        releasedByAdminId: req.user.adminId,
        releasedByEmployeeId: req.user.employeeId,
      },
    });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "DISBURSAL_HOLD_RELEASED", table: "DisbursalHold", targetId: hold.id, metadata: { loanId: hold.loanId } });
    res.json({ message: "Disbursal hold released", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to release hold", message: err.message });
  }
};

exports.cancelHold = async (req, res) => {
  try {
    const hold = await prisma.disbursalHold.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED", releasedAt: new Date(), releasedByAdminId: req.user.adminId },
    });
    res.json({ message: "Hold cancelled", data: hold });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel hold", message: err.message });
  }
};

// Check if a loan has an active hold (used in disbursal flow)
exports.checkHold = async (req, res) => {
  try {
    const { loanId } = req.query;
    if (!loanId) return res.status(400).json({ error: "loanId is required" });

    const activeHold = await prisma.disbursalHold.findFirst({
      where: { loanId, status: "ACTIVE" },
    });

    res.json({ data: { hasActiveHold: !!activeHold, hold: activeHold || null } });
  } catch (err) {
    res.status(500).json({ error: "Failed to check hold status" });
  }
};

exports.releaseHoldByLoan = async (req, res) => {
  try {
    const { loanId, releaseNote } = req.body;
    if (!loanId) return res.status(400).json({ error: "loanId is required" });

    const hold = await prisma.disbursalHold.findFirst({ where: { loanId, status: "ACTIVE" } });
    if (!hold) return res.status(404).json({ error: "No active hold found for this loan" });

    const updated = await prisma.disbursalHold.update({
      where: { id: hold.id },
      data: {
        status: "RELEASED",
        releaseNote,
        releasedAt: new Date(),
        releasedByAdminId: req.user.adminId,
        releasedByEmployeeId: req.user.employeeId,
      },
    });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "DISBURSAL_HOLD_RELEASED", table: "DisbursalHold", targetId: hold.id, metadata: { loanId } });
    res.json({ message: "Disbursal hold released", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to release hold", message: err.message });
  }
};
