const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");
const { pushInApp } = require("../utils/notificationService");
const { notifyRegionalApprovers, notifyCreator, notifyUser } = require("../utils/notifyRegional");
const { getRegionFilter } = require("../utils/regionFilter");

async function notifyAdmins(title, message, linkUrl, triggerEvent = "KYC_EVENT") {
  try {
    const admin = await prisma.admin.findFirst({ select: { id: true } });
    if (admin) await pushInApp({ targetType: "ADMIN", targetId: admin.id, title, message, triggerEvent, linkUrl });
  } catch (_) {}
}

// ─── KYC List (all users with KYC status) ────────────────────────────────────
exports.listKYC = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Region scoping — KYCRecord has no regionId, but its user does
    const regionFilter = getRegionFilter(req.user);
    const userRegionWhere = regionFilter ? { user: regionFilter } : {};

    const where = { ...userRegionWhere };
    if (status) where.status = status;

    const [records, total] = await Promise.all([
      prisma.kYCRecord.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
          documents: { select: { id: true, documentType: true, verificationStatus: true } },
          riskFlags: { where: { isResolved: false }, select: { id: true, flagType: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.kYCRecord.count({ where }),
    ]);

    // Also fetch users who have NO KYC record yet (status = "NOT_STARTED")
    const usersWithKyc = new Set(records.map((r) => r.userId));
    let noKycUsers = [];
    if (!status || status === "NOT_STARTED") {
      noKycUsers = await prisma.user.findMany({
        where: {
          isDeleted: false,
          id: { notIn: Array.from(usersWithKyc) },
          ...(regionFilter || {}),
          ...(search ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ]
          } : {}),
        },
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        take: 50,
      });
    }

    const noKycEntries = noKycUsers.map((u) => ({
      id: null,
      userId: u.id,
      status: "NOT_STARTED",
      user: u,
      documents: [],
      riskFlags: [],
      verifiedAt: null,
      updatedAt: null,
    }));

    res.json({
      data: [...records, ...noKycEntries],
      total: total + noKycUsers.length,
      page: Number(page),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to list KYC records", message: err.message });
  }
};

// ─── KYC Record ──────────────────────────────────────────────────────────────

exports.getOrCreateKYC = async (req, res) => {
  try {
    const { userId } = req.params;
    let record = await prisma.kYCRecord.findUnique({ where: { userId }, include: { documents: true, riskFlags: true } });
    if (!record) {
      record = await prisma.kYCRecord.create({ data: { userId }, include: { documents: true, riskFlags: true } });
    }
    res.json({ data: record });
  } catch (err) {
    res.status(500).json({ error: "Failed to get KYC record", message: err.message });
  }
};

exports.updateKYCStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, verificationMethod, rejectionReason, reviewNotes, expiresAt, nextReviewDue } = req.body;

    const existing = await prisma.kYCRecord.findUnique({ where: { userId } });
    if (!existing) return res.status(404).json({ error: "KYC record not found" });

    const data = { status, verificationMethod, rejectionReason, reviewNotes };
    if (expiresAt) data.expiresAt = new Date(expiresAt);
    if (nextReviewDue) data.nextReviewDue = new Date(nextReviewDue);
    if (status === "FULLY_VERIFIED") {
      data.verifiedAt = new Date();
      data.verifiedByAdminId = req.user.adminId;
      data.verifiedByEmployeeId = req.user.employeeId;
    }

    const record = await prisma.kYCRecord.update({ where: { userId }, data });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `KYC STATUS UPDATED: ${status}`, table: "KYCRecord", targetId: record.id });

    // Notify the employee who created this user + the customer
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (user?.employeeId) {
      const isApproved = status === "FULLY_VERIFIED";
      notifyCreator({ employeeId: user.employeeId, title: isApproved ? "KYC Approved" : "KYC Status Updated", message: `KYC for user ${userId} has been ${status === "FULLY_VERIFIED" ? "fully verified" : status === "REJECTED" ? "rejected" : "updated to " + status}`, linkUrl: `/kyc/${userId}`, triggerEvent: "KYC_STATUS_UPDATED" });
    }
    if (status === "FULLY_VERIFIED") {
      notifyUser({ userId, title: "KYC Verified", message: "Your KYC has been fully verified. You can now access all services.", linkUrl: `/kyc/${userId}`, triggerEvent: "KYC_APPROVED" });
    } else if (status === "REJECTED") {
      notifyUser({ userId, title: "KYC Rejected", message: `Your KYC has been rejected${rejectionReason ? ": " + rejectionReason : ". Please resubmit your documents."}`, linkUrl: `/kyc/${userId}`, triggerEvent: "KYC_REJECTED" });
    }

    res.json({ message: "KYC status updated", data: record });
  } catch (err) {
    res.status(500).json({ error: "Failed to update KYC status", message: err.message });
  }
};

// ─── KYC Documents ───────────────────────────────────────────────────────────

exports.addDocument = async (req, res) => {
  try {
    const { userId } = req.params;
    const { documentType, documentNumber, fileId, expiresAt } = req.body;

    let record = await prisma.kYCRecord.findUnique({ where: { userId } });
    if (!record) record = await prisma.kYCRecord.create({ data: { userId } });

    const doc = await prisma.kYCDocument.create({
      data: { kycRecordId: record.id, documentType, documentNumber, fileId, expiresAt: expiresAt ? new Date(expiresAt) : null },
    });

    // Notify regional KYC_APPROVE holders that a document needs review
    // KYC is user-scoped; use user's branchId from their loans (or fall back to any branch)
    const userForBranch = await prisma.user.findUnique({ where: { id: userId }, select: { loans: { select: { branchId: true }, take: 1 } } });
    const kycBranchId = userForBranch?.loans?.[0]?.branchId || null;
    notifyRegionalApprovers({ branchId: kycBranchId, permission: "KYC_APPROVE", title: "KYC Document Uploaded", message: `New ${documentType} document for user ${userId} needs review`, linkUrl: `/kyc/${userId}`, triggerEvent: "KYC_DOCUMENT_ADDED", excludeEmployeeId: req.user?.employeeId });

    res.status(201).json({ message: "Document added", data: doc });
  } catch (err) {
    res.status(500).json({ error: "Failed to add KYC document", message: err.message });
  }
};

exports.verifyDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { verificationStatus, rejectionReason } = req.body;
    const doc = await prisma.kYCDocument.update({
      where: { id: documentId },
      data: {
        verificationStatus,
        rejectionReason,
        verifiedAt: verificationStatus === "VERIFIED" ? new Date() : null,
        verifiedByAdminId: req.user.adminId,
        verifiedByEmployeeId: req.user.employeeId,
      },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `KYC DOCUMENT ${verificationStatus}`, table: "KYCDocument", targetId: doc.id });
    res.json({ message: "Document verification updated", data: doc });
  } catch (err) {
    res.status(500).json({ error: "Failed to verify document", message: err.message });
  }
};

// ─── Risk Flags ───────────────────────────────────────────────────────────────

exports.addRiskFlag = async (req, res) => {
  try {
    const { userId } = req.params;
    const { flagType, description, metadata } = req.body;

    let record = await prisma.kYCRecord.findUnique({ where: { userId } });
    if (!record) record = await prisma.kYCRecord.create({ data: { userId } });

    const flag = await prisma.kYCRiskFlag.create({ data: { kycRecordId: record.id, flagType, description, metadata } });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `KYC RISK FLAG ADDED: ${flagType}`, table: "KYCRiskFlag", targetId: flag.id });
    res.status(201).json({ message: "Risk flag added", data: flag });
  } catch (err) {
    res.status(500).json({ error: "Failed to add risk flag", message: err.message });
  }
};

exports.resolveRiskFlag = async (req, res) => {
  try {
    const { flagId } = req.params;
    const { resolutionNote } = req.body;
    const flag = await prisma.kYCRiskFlag.update({
      where: { id: flagId },
      data: { isResolved: true, resolvedAt: new Date(), resolutionNote, resolvedByAdminId: req.user.adminId, resolvedByEmployeeId: req.user.employeeId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "KYC RISK FLAG RESOLVED", table: "KYCRiskFlag", targetId: flag.id });
    res.json({ message: "Risk flag resolved", data: flag });
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve risk flag", message: err.message });
  }
};

exports.listRiskFlags = async (req, res) => {
  try {
    const { isResolved, flagType } = req.query;
    const where = {};
    if (isResolved !== undefined) where.isResolved = isResolved === "true";
    if (flagType) where.flagType = flagType;
    const flags = await prisma.kYCRiskFlag.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
    res.json({ data: flags });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch risk flags" });
  }
};

// ─── Blacklist ────────────────────────────────────────────────────────────────

exports.addToBlacklist = async (req, res) => {
  try {
    const { valueType, value, reason, metadata } = req.body;
    const entry = await prisma.blacklistEntry.upsert({
      where: { valueType_value: { valueType, value } },
      update: { isActive: true, reason, metadata, addedByAdminId: req.user.adminId, removedAt: null, removedByAdminId: null },
      create: { valueType, value, reason, metadata, addedByAdminId: req.user.adminId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "BLACKLIST ENTRY ADDED", table: "BlacklistEntry", targetId: entry.id });
    res.status(201).json({ message: "Added to blacklist", data: entry });
  } catch (err) {
    res.status(500).json({ error: "Failed to add to blacklist", message: err.message });
  }
};

exports.removeFromBlacklist = async (req, res) => {
  try {
    const entry = await prisma.blacklistEntry.update({
      where: { id: req.params.id },
      data: { isActive: false, removedAt: new Date(), removedByAdminId: req.user.adminId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "BLACKLIST ENTRY REMOVED", table: "BlacklistEntry", targetId: entry.id });
    res.json({ message: "Removed from blacklist", data: entry });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove from blacklist", message: err.message });
  }
};

exports.checkBlacklist = async (req, res) => {
  try {
    const { valueType, value } = req.query;
    if (!valueType || !value) return res.status(400).json({ error: "valueType and value are required" });
    const entry = await prisma.blacklistEntry.findUnique({ where: { valueType_value: { valueType, value } } });
    res.json({ isBlacklisted: !!entry?.isActive, data: entry || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to check blacklist" });
  }
};

exports.listBlacklist = async (req, res) => {
  try {
    const { valueType, isActive } = req.query;
    const where = {};
    if (valueType) where.valueType = valueType;
    if (isActive !== undefined) where.isActive = isActive === "true";
    const entries = await prisma.blacklistEntry.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: entries });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch blacklist" });
  }
};
