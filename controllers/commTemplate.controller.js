const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

exports.createTemplate = async (req, res) => {
  try {
    const { name, type, category, subject, body, variables, language } = req.body;
    const template = await prisma.commTemplate.create({
      data: {
        name, type, category, subject, body,
        variables: variables || [],
        language: language || "en",
        createdByAdminId: req.user.adminId,
        createdByEmployeeId: req.user.employeeId,
      },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "COMM_TEMPLATE_CREATED", table: "CommTemplate", targetId: template.id });
    res.status(201).json({ message: "Template created", data: template });
  } catch (err) {
    res.status(500).json({ error: "Failed to create template", message: err.message });
  }
};

exports.listTemplates = async (req, res) => {
  try {
    const { type, category, isActive, language } = req.query;
    const where = {};
    if (type) where.type = type;
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === "true";
    if (language) where.language = language;
    const templates = await prisma.commTemplate.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: templates });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch templates" });
  }
};

exports.getTemplate = async (req, res) => {
  try {
    const template = await prisma.commTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json({ data: template });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch template" });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const { name, subject, body, variables, isActive, language } = req.body;
    const template = await prisma.commTemplate.update({
      where: { id: req.params.id },
      data: { name, subject, body, variables, isActive, language },
    });
    res.json({ message: "Template updated", data: template });
  } catch (err) {
    res.status(500).json({ error: "Failed to update template", message: err.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    await prisma.commTemplate.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: "Template deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete template", message: err.message });
  }
};

// Render a template with variable substitution
exports.renderTemplate = async (req, res) => {
  try {
    const template = await prisma.commTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: "Template not found" });

    const vars = req.body.variables || {};
    let rendered = template.body;
    for (const [key, value] of Object.entries(vars)) {
      rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
    }

    res.json({ data: { subject: template.subject, body: rendered } });
  } catch (err) {
    res.status(500).json({ error: "Failed to render template", message: err.message });
  }
};

// Log a sent communication
exports.logComm = async (req, res) => {
  try {
    const { templateId, loanId, userId, type, recipient, subject, body, status } = req.body;
    const log = await prisma.commLog.create({
      data: {
        templateId, loanId, userId, type, recipient, subject, body,
        status: status || "SENT",
        sentAt: new Date(),
        sentByAdminId: req.user.adminId,
        sentByEmployeeId: req.user.employeeId,
      },
    });
    res.status(201).json({ message: "Communication logged", data: log });
  } catch (err) {
    res.status(500).json({ error: "Failed to log communication", message: err.message });
  }
};

exports.listLogs = async (req, res) => {
  try {
    const { loanId, userId, status, type } = req.query;
    const where = {};
    if (loanId) where.loanId = loanId;
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (type) where.type = type;
    const logs = await prisma.commLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    res.json({ data: logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch communication logs" });
  }
};
