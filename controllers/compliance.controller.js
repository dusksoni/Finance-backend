const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Legal Hold ───────────────────────────────────────────────────────────────

exports.placeHold = async (req, res) => {
  try {
    const { entityType, entityId, reason, metadata } = req.body;
    if (!reason) return res.status(400).json({ error: "Reason is required for legal hold" });
    const hold = await prisma.legalHold.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      update: { reason, metadata, heldByAdminId: req.user.adminId, releasedAt: null, releasedByAdminId: null, releaseNote: null },
      create: { entityType, entityId, reason, metadata, heldByAdminId: req.user.adminId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "LEGAL HOLD PLACED", table: "LegalHold", targetId: hold.id, metadata: { entityType, entityId, reason } });
    res.status(201).json({ message: "Legal hold placed", data: hold });
  } catch (err) {
    res.status(500).json({ error: "Failed to place legal hold", message: err.message });
  }
};

exports.releaseHold = async (req, res) => {
  try {
    const { releaseNote } = req.body;
    const hold = await prisma.legalHold.update({
      where: { id: req.params.id },
      data: { releasedAt: new Date(), releasedByAdminId: req.user.adminId, releaseNote },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "LEGAL HOLD RELEASED", table: "LegalHold", targetId: hold.id });
    res.json({ message: "Legal hold released", data: hold });
  } catch (err) {
    res.status(500).json({ error: "Failed to release legal hold", message: err.message });
  }
};

exports.listHolds = async (req, res) => {
  try {
    const { entityType, isActive } = req.query;
    const where = {};
    if (entityType) where.entityType = entityType;
    if (isActive === "true") where.releasedAt = null;
    if (isActive === "false") where.releasedAt = { not: null };
    const holds = await prisma.legalHold.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: holds });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch legal holds" });
  }
};

exports.checkHold = async (req, res) => {
  try {
    const { entityType, entityId } = req.query;
    if (!entityType || !entityId) return res.status(400).json({ error: "entityType and entityId required" });
    const hold = await prisma.legalHold.findUnique({ where: { entityType_entityId: { entityType, entityId } } });
    const isHeld = !!hold && !hold.releasedAt;
    res.json({ isHeld, data: hold || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to check legal hold" });
  }
};

// ─── PII Access Log ───────────────────────────────────────────────────────────

exports.logPIIAccess = async (req, res) => {
  try {
    const { targetUserId, fieldName, purpose, ipAddress } = req.body;
    const log = await prisma.pIIAccessLog.create({
      data: { targetUserId, fieldName, purpose, ipAddress, accessedByAdminId: req.user.adminId, accessedByEmployeeId: req.user.employeeId },
    });
    res.status(201).json({ message: "PII access logged", data: log });
  } catch (err) {
    res.status(500).json({ error: "Failed to log PII access", message: err.message });
  }
};

exports.listPIIAccessLogs = async (req, res) => {
  try {
    const { targetUserId, fieldName, fromDate, toDate } = req.query;
    const where = {};
    if (targetUserId) where.targetUserId = targetUserId;
    if (fieldName) where.fieldName = fieldName;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }
    const logs = await prisma.pIIAccessLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
    res.json({ data: logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch PII access logs" });
  }
};
