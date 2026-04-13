const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Collateral Records ───────────────────────────────────────────────────────

exports.createCollateral = async (req, res) => {
  try {
    const { loanId, collateralType, description, currentValue, lastValuedAt, nextValuationDue, insuredTill, insuranceCompany, policyNumber, notes, metadata } = req.body;
    const collateral = await prisma.collateralRecord.create({
      data: {
        loanId, collateralType, description,
        currentValue: currentValue ?? null,
        lastValuedAt: lastValuedAt ? new Date(lastValuedAt) : null,
        nextValuationDue: nextValuationDue ? new Date(nextValuationDue) : null,
        insuredTill: insuredTill ? new Date(insuredTill) : null,
        insuranceCompany, policyNumber, notes, metadata,
        createdByAdminId: req.user.adminId,
        createdByEmployeeId: req.user.employeeId,
      },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "COLLATERAL CREATED", table: "CollateralRecord", targetId: collateral.id, metadata: { loanId, collateralType } });
    res.status(201).json({ message: "Collateral record created", data: collateral });
  } catch (err) {
    res.status(500).json({ error: "Failed to create collateral record", message: err.message });
  }
};

exports.listCollaterals = async (req, res) => {
  try {
    const { loanId, status, collateralType } = req.query;
    const where = {};
    if (loanId) where.loanId = loanId;
    if (status) where.status = status;
    if (collateralType) where.collateralType = collateralType;
    const collaterals = await prisma.collateralRecord.findMany({
      where,
      include: { valuations: { orderBy: { valuedAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: collaterals });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch collaterals" });
  }
};

exports.getCollateral = async (req, res) => {
  try {
    const collateral = await prisma.collateralRecord.findUnique({
      where: { id: req.params.id },
      include: { valuations: { orderBy: { valuedAt: "desc" } } },
    });
    if (!collateral) return res.status(404).json({ error: "Collateral not found" });
    res.json({ data: collateral });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch collateral" });
  }
};

exports.updateCollateral = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.lastValuedAt) data.lastValuedAt = new Date(data.lastValuedAt);
    if (data.nextValuationDue) data.nextValuationDue = new Date(data.nextValuationDue);
    if (data.insuredTill) data.insuredTill = new Date(data.insuredTill);
    const collateral = await prisma.collateralRecord.update({ where: { id: req.params.id }, data });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "COLLATERAL UPDATED", table: "CollateralRecord", targetId: collateral.id });
    res.json({ message: "Collateral updated", data: collateral });
  } catch (err) {
    res.status(500).json({ error: "Failed to update collateral", message: err.message });
  }
};

exports.updateCollateralStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const collateral = await prisma.collateralRecord.update({ where: { id: req.params.id }, data: { status, notes } });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `COLLATERAL STATUS: ${status}`, table: "CollateralRecord", targetId: collateral.id });
    res.json({ message: "Status updated", data: collateral });
  } catch (err) {
    res.status(500).json({ error: "Failed to update collateral status", message: err.message });
  }
};

// ─── Valuations ───────────────────────────────────────────────────────────────

exports.addValuation = async (req, res) => {
  try {
    const { collateralId } = req.params;
    const { value, valuedAt, valuer, method, reportFileId, notes } = req.body;

    const collateral = await prisma.collateralRecord.findUnique({ where: { id: collateralId } });
    if (!collateral) return res.status(404).json({ error: "Collateral not found" });

    const valuation = await prisma.collateralValuation.create({
      data: { collateralId, value, valuedAt: new Date(valuedAt), valuer, method, reportFileId, notes, createdByAdminId: req.user.adminId, createdByEmployeeId: req.user.employeeId },
    });

    // Update current value on collateral
    await prisma.collateralRecord.update({
      where: { id: collateralId },
      data: { currentValue: value, lastValuedAt: new Date(valuedAt) },
    });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "COLLATERAL VALUATION ADDED", table: "CollateralValuation", targetId: valuation.id, metadata: { collateralId, value } });
    res.status(201).json({ message: "Valuation added", data: valuation });
  } catch (err) {
    res.status(500).json({ error: "Failed to add valuation", message: err.message });
  }
};

exports.listValuations = async (req, res) => {
  try {
    const valuations = await prisma.collateralValuation.findMany({
      where: { collateralId: req.params.collateralId },
      orderBy: { valuedAt: "desc" },
    });
    res.json({ data: valuations });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch valuations" });
  }
};

// List collaterals with insurance expiring soon
exports.expiringInsurance = async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.days, 10) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);
    const collaterals = await prisma.collateralRecord.findMany({
      where: { insuredTill: { lte: cutoff, gte: new Date() }, status: "ACTIVE" },
      include: { loan: { select: { fileNo: true, userId: true } } },
      orderBy: { insuredTill: "asc" },
    });
    res.json({ data: collaterals });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch expiring insurance" });
  }
};

// List collaterals with valuation due
exports.valuationDue = async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.days, 10) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);
    const collaterals = await prisma.collateralRecord.findMany({
      where: { nextValuationDue: { lte: cutoff }, status: "ACTIVE" },
      include: { loan: { select: { fileNo: true, userId: true } } },
      orderBy: { nextValuationDue: "asc" },
    });
    res.json({ data: collaterals });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch valuation due" });
  }
};
