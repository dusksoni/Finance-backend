const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

exports.createVersion = async (req, res) => {
  try {
    const { loanTypeId, rules, changeNote, effectiveFrom } = req.body;

    const loanType = await prisma.loanType.findUnique({ where: { id: loanTypeId } });
    if (!loanType) return res.status(404).json({ error: "LoanType not found" });

    // Find next version number
    const latest = await prisma.loanTypeRuleVersion.findFirst({
      where: { loanTypeId },
      orderBy: { version: "desc" },
    });
    const version = (latest?.version || 0) + 1;

    const snapshot = await prisma.loanTypeRuleVersion.create({
      data: {
        loanTypeId,
        version,
        rules: rules || loanType.rules,
        changeNote,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        createdByAdminId: req.user.adminId,
        createdByEmployeeId: req.user.employeeId,
      },
    });

    // Also update the live rules on LoanType if rules provided
    if (rules) {
      await prisma.loanType.update({ where: { id: loanTypeId }, data: { rules } });
    }

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `LOAN_TYPE_RULE_VERSION_CREATED: v${version}`, table: "LoanTypeRuleVersion", targetId: snapshot.id, metadata: { loanTypeId } });
    res.status(201).json({ message: "Rule version created", data: snapshot });
  } catch (err) {
    res.status(500).json({ error: "Failed to create rule version", message: err.message });
  }
};

exports.listVersions = async (req, res) => {
  try {
    const { loanTypeId } = req.query;
    const where = {};
    if (loanTypeId) where.loanTypeId = loanTypeId;
    const versions = await prisma.loanTypeRuleVersion.findMany({ where, orderBy: { version: "desc" } });
    res.json({ data: versions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rule versions" });
  }
};

exports.getVersion = async (req, res) => {
  try {
    const version = await prisma.loanTypeRuleVersion.findUnique({ where: { id: req.params.id } });
    if (!version) return res.status(404).json({ error: "Version not found" });
    res.json({ data: version });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rule version" });
  }
};

exports.rollbackToVersion = async (req, res) => {
  try {
    const version = await prisma.loanTypeRuleVersion.findUnique({ where: { id: req.params.id } });
    if (!version) return res.status(404).json({ error: "Version not found" });

    // Snapshot current state before rollback
    const loanType = await prisma.loanType.findUnique({ where: { id: version.loanTypeId } });
    const latest = await prisma.loanTypeRuleVersion.findFirst({
      where: { loanTypeId: version.loanTypeId },
      orderBy: { version: "desc" },
    });

    await prisma.loanTypeRuleVersion.create({
      data: {
        loanTypeId: version.loanTypeId,
        version: (latest?.version || 0) + 1,
        rules: loanType.rules,
        changeNote: `Rollback to version ${version.version}`,
        createdByAdminId: req.user.adminId,
        createdByEmployeeId: req.user.employeeId,
      },
    });

    await prisma.loanType.update({ where: { id: version.loanTypeId }, data: { rules: version.rules } });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `LOAN_TYPE_ROLLBACK: v${version.version}`, table: "LoanType", targetId: version.loanTypeId });
    res.json({ message: `Rolled back to version ${version.version}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to rollback", message: err.message });
  }
};
