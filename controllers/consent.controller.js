const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Consent Templates ───────────────────────────────────────────────────────

exports.createTemplate = async (req, res) => {
  try {
    const { consentType, version, language, title, body } = req.body;
    const template = await prisma.consentTemplate.create({
      data: { consentType, version, language: language ?? "en", title, body, createdByAdminId: req.user.adminId },
    });
    res.status(201).json({ message: "Consent template created", data: template });
  } catch (err) {
    if (err.code === "P2002") return res.status(400).json({ error: "Template with this type/version/language already exists" });
    res.status(500).json({ error: "Failed to create consent template", message: err.message });
  }
};

exports.listTemplates = async (req, res) => {
  try {
    const { consentType, isActive } = req.query;
    const where = {};
    if (consentType) where.consentType = consentType;
    if (isActive !== undefined) where.isActive = isActive === "true";
    const templates = await prisma.consentTemplate.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: templates });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch consent templates" });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const template = await prisma.consentTemplate.update({ where: { id: req.params.id }, data: req.body });
    res.json({ message: "Updated", data: template });
  } catch (err) {
    res.status(500).json({ error: "Failed to update consent template", message: err.message });
  }
};

// ─── Consent Records ─────────────────────────────────────────────────────────

exports.recordConsent = async (req, res) => {
  try {
    const { userId, loanId, consentType, templateId, version, channel, ipAddress, deviceInfo, expiresAt, metadata } = req.body;
    const record = await prisma.consentRecord.create({
      data: { userId, loanId, consentType, templateId, version, channel, ipAddress, deviceInfo, metadata, expiresAt: expiresAt ? new Date(expiresAt) : null },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `CONSENT RECORDED: ${consentType}`, table: "ConsentRecord", targetId: record.id });
    res.status(201).json({ message: "Consent recorded", data: record });
  } catch (err) {
    res.status(500).json({ error: "Failed to record consent", message: err.message });
  }
};

exports.withdrawConsent = async (req, res) => {
  try {
    const { withdrawalReason } = req.body;
    const record = await prisma.consentRecord.update({
      where: { id: req.params.id },
      data: { isWithdrawn: true, withdrawnAt: new Date(), withdrawalReason },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "CONSENT WITHDRAWN", table: "ConsentRecord", targetId: record.id });
    res.json({ message: "Consent withdrawn", data: record });
  } catch (err) {
    res.status(500).json({ error: "Failed to withdraw consent", message: err.message });
  }
};

exports.getUserConsents = async (req, res) => {
  try {
    const { userId } = req.params;
    const { consentType } = req.query;
    const where = { userId };
    if (consentType) where.consentType = consentType;
    const records = await prisma.consentRecord.findMany({ where, orderBy: { consentedAt: "desc" } });
    res.json({ data: records });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch consent records" });
  }
};

// Check if a specific consent is active for a user
exports.checkConsent = async (req, res) => {
  try {
    const { userId, consentType } = req.query;
    if (!userId || !consentType) return res.status(400).json({ error: "userId and consentType required" });
    const record = await prisma.consentRecord.findFirst({
      where: { userId, consentType, isWithdrawn: false },
      orderBy: { consentedAt: "desc" },
    });
    const isValid = !!record && (!record.expiresAt || record.expiresAt > new Date());
    res.json({ isValid, data: record || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to check consent" });
  }
};

// ─── KFS Delivery ─────────────────────────────────────────────────────────────

exports.deliverKFS = async (req, res) => {
  try {
    const { loanId, version, templateId, deliveryChannel, fileId, ipAddress, deviceInfo, metadata } = req.body;
    const delivery = await prisma.kFSDelivery.create({
      data: { loanId, version, templateId, deliveryChannel, fileId, ipAddress, deviceInfo, metadata },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "KFS DELIVERED", table: "KFSDelivery", targetId: delivery.id, metadata: { loanId, version } });
    res.status(201).json({ message: "KFS delivery recorded", data: delivery });
  } catch (err) {
    res.status(500).json({ error: "Failed to record KFS delivery", message: err.message });
  }
};

exports.acceptKFS = async (req, res) => {
  try {
    const { ipAddress, deviceInfo } = req.body;
    const delivery = await prisma.kFSDelivery.update({
      where: { id: req.params.id },
      data: { acceptedAt: new Date(), ipAddress, deviceInfo },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "KFS ACCEPTED", table: "KFSDelivery", targetId: delivery.id });
    res.json({ message: "KFS acceptance recorded", data: delivery });
  } catch (err) {
    res.status(500).json({ error: "Failed to record KFS acceptance", message: err.message });
  }
};

exports.getLoanKFSHistory = async (req, res) => {
  try {
    const deliveries = await prisma.kFSDelivery.findMany({
      where: { loanId: req.params.loanId },
      orderBy: { deliveredAt: "desc" },
    });
    res.json({ data: deliveries });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch KFS deliveries" });
  }
};

// ─── Consent Template Versioning ──────────────────────────────────────────────

exports.snapshotTemplate = async (req, res) => {
  try {
    const template = await prisma.consentTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: "Template not found" });

    // Store current version in metadata before update
    const history = template.metadata?.versionHistory || [];
    history.push({
      version: template.version || 1,
      body: template.body,
      snapshotAt: new Date().toISOString(),
      snapshotBy: req.user.adminId || req.user.employeeId,
    });

    const { body, name } = req.body;
    const updated = await prisma.consentTemplate.update({
      where: { id: req.params.id },
      data: {
        name: name || template.name,
        body: body || template.body,
        version: (template.version || 1) + 1,
        metadata: { ...(template.metadata || {}), versionHistory: history },
      },
    });

    res.json({ message: "Template updated with version history preserved", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update template", message: err.message });
  }
};

exports.getTemplateHistory = async (req, res) => {
  try {
    const template = await prisma.consentTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json({ data: { currentVersion: template.version, history: template.metadata?.versionHistory || [] } });
  } catch (err) {
    res.status(500).json({ error: "Failed to get template history" });
  }
};
