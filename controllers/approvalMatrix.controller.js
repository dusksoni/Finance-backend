const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Approval Matrix CRUD ────────────────────────────────────────────────────

exports.createMatrix = async (req, res) => {
  try {
    const { entityType, name, description, minAmount, maxAmount, requiredCount, requiredRoleIds, autoApprove, priority } = req.body;
    const matrix = await prisma.approvalMatrix.create({
      data: {
        entityType,
        name,
        description,
        minAmount: minAmount ?? 0,
        maxAmount: maxAmount ?? null,
        requiredCount: requiredCount ?? 1,
        requiredRoleIds: requiredRoleIds ?? [],
        autoApprove: autoApprove ?? false,
        priority: priority ?? 0,
        createdByAdminId: req.user.adminId,
      },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "CREATED APPROVAL MATRIX", table: "ApprovalMatrix", targetId: matrix.id, metadata: matrix });
    res.status(201).json({ message: "Approval matrix created", data: matrix });
  } catch (err) {
    res.status(500).json({ error: "Failed to create approval matrix", message: err.message });
  }
};

exports.listMatrices = async (req, res) => {
  try {
    const { entityType } = req.query;
    const matrices = await prisma.approvalMatrix.findMany({
      where: entityType ? { entityType, isActive: true } : { isActive: true },
      orderBy: [{ entityType: "asc" }, { priority: "desc" }],
    });
    res.json({ data: matrices });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch approval matrices" });
  }
};

exports.updateMatrix = async (req, res) => {
  try {
    const existing = await prisma.approvalMatrix.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Matrix not found" });
    const matrix = await prisma.approvalMatrix.update({ where: { id: req.params.id }, data: req.body });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "UPDATED APPROVAL MATRIX", table: "ApprovalMatrix", targetId: matrix.id });
    res.json({ message: "Updated", data: matrix });
  } catch (err) {
    res.status(500).json({ error: "Failed to update approval matrix", message: err.message });
  }
};

exports.deleteMatrix = async (req, res) => {
  try {
    await prisma.approvalMatrix.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: "Approval matrix deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete approval matrix" });
  }
};

// ─── Approval Requests ────────────────────────────────────────────────────────

exports.createRequest = async (req, res) => {
  try {
    const { entityType, entityId, requestedAmount, metadata, expiresAt } = req.body;

    // Find best matching matrix
    const amount = requestedAmount ? Number(requestedAmount) : 0;
    const matrices = await prisma.approvalMatrix.findMany({
      where: { entityType, isActive: true },
      orderBy: { priority: "desc" },
    });

    let matchedMatrix = null;
    for (const m of matrices) {
      const aboveMin = amount >= Number(m.minAmount);
      const belowMax = !m.maxAmount || amount <= Number(m.maxAmount);
      if (aboveMin && belowMax) { matchedMatrix = m; break; }
    }

    // Auto-approve if matrix says so
    if (matchedMatrix?.autoApprove) {
      const request = await prisma.approvalRequest.create({
        data: {
          matrixId: matchedMatrix.id,
          entityType,
          entityId,
          requestedAmount: amount,
          status: "APPROVED",
          requiredCount: 0,
          approvedCount: 0,
          metadata,
          requestedByAdminId: req.user.adminId,
          requestedByEmployeeId: req.user.employeeId,
        },
      });
      return res.status(201).json({ message: "Auto-approved", data: request });
    }

    const requiredCount = matchedMatrix?.requiredCount ?? 1;
    const request = await prisma.approvalRequest.create({
      data: {
        matrixId: matchedMatrix?.id,
        entityType,
        entityId,
        requestedAmount: amount,
        requiredCount,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        metadata,
        requestedByAdminId: req.user.adminId,
        requestedByEmployeeId: req.user.employeeId,
      },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "CREATED APPROVAL REQUEST", table: "ApprovalRequest", targetId: request.id });
    res.status(201).json({ message: "Approval request created", data: request });
  } catch (err) {
    res.status(500).json({ error: "Failed to create approval request", message: err.message });
  }
};

exports.listRequests = async (req, res) => {
  try {
    const { entityType, entityId, status } = req.query;
    const where = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (status) where.status = status;
    const requests = await prisma.approvalRequest.findMany({
      where,
      include: { votes: true, matrix: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: requests });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch approval requests" });
  }
};

exports.getRequest = async (req, res) => {
  try {
    const request = await prisma.approvalRequest.findUnique({
      where: { id: req.params.id },
      include: { votes: true, matrix: true },
    });
    if (!request) return res.status(404).json({ error: "Request not found" });
    res.json({ data: request });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch approval request" });
  }
};

exports.vote = async (req, res) => {
  try {
    const { decision, reason } = req.body;
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      return res.status(400).json({ error: "decision must be APPROVED or REJECTED" });
    }

    const request = await prisma.approvalRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "PENDING" && request.status !== "PARTIALLY_APPROVED") {
      return res.status(400).json({ error: `Cannot vote on a request with status ${request.status}` });
    }

    // Check expiry
    if (request.expiresAt && new Date() > request.expiresAt) {
      await prisma.approvalRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
      return res.status(400).json({ error: "Approval request has expired" });
    }

    const vote = await prisma.approvalVote.create({
      data: {
        requestId: request.id,
        decision,
        reason,
        votedByAdminId: req.user.adminId,
        votedByEmployeeId: req.user.employeeId,
      },
    });

    // Recompute status
    const allVotes = await prisma.approvalVote.findMany({ where: { requestId: request.id } });
    const approved = allVotes.filter((v) => v.decision === "APPROVED").length;
    const rejected = allVotes.filter((v) => v.decision === "REJECTED").length;

    let newStatus = "PARTIALLY_APPROVED";
    if (rejected > 0) newStatus = "REJECTED";
    else if (approved >= request.requiredCount) newStatus = "APPROVED";

    const updated = await prisma.approvalRequest.update({
      where: { id: request.id },
      data: { approvedCount: approved, rejectedCount: rejected, status: newStatus, rejectionReason: rejected > 0 ? reason : null },
    });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `APPROVAL VOTE: ${decision}`, table: "ApprovalRequest", targetId: request.id });
    res.json({ message: "Vote recorded", data: { vote, request: updated } });
  } catch (err) {
    res.status(500).json({ error: "Failed to record vote", message: err.message });
  }
};

// ─── Override Log ─────────────────────────────────────────────────────────────

exports.logOverride = async (req, res) => {
  try {
    const { entityType, entityId, action, reason, supervisorAdminId, metadata } = req.body;
    if (!reason) return res.status(400).json({ error: "Override reason is mandatory" });
    const log = await prisma.overrideLog.create({
      data: {
        entityType,
        entityId,
        action,
        reason,
        supervisorAdminId,
        overriddenByAdminId: req.user.adminId,
        overriddenByEmployeeId: req.user.employeeId,
        metadata,
      },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "OVERRIDE LOGGED", table: "OverrideLog", targetId: log.id, metadata: { entityType, entityId, reason } });
    res.status(201).json({ message: "Override logged", data: log });
  } catch (err) {
    res.status(500).json({ error: "Failed to log override", message: err.message });
  }
};

exports.listOverrides = async (req, res) => {
  try {
    const { entityType, entityId } = req.query;
    const where = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    const logs = await prisma.overrideLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ data: logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch override logs" });
  }
};
