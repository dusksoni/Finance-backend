const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");
const {
  DEFAULT_LOAN_PRODUCT_RULES,
  normalizeLoanProductRules,
  validateLoanProductRules,
} = require("../utils/loanTypeRules");

// Create Loan Type
exports.createLoanType = async (req, res) => {
  const { name, description, label, rules } = req.body;
  try {
    const existingType = await prisma.loanType.findUnique({
      where: { name },
    });

    if (existingType) {
      return res.status(400).json({ error: "Loan type already Exsist" });
    }
    const normalizedRules = validateLoanProductRules(rules);

    const loanType = await prisma.loanType.create({
      data: { name, description, label, rules: normalizedRules },
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.activity,
      action: "CREATED LOAN TYPE",
      table: "LoanType",
      targetId: loanType.id,
      metadata: loanType,
    });

    res.status(201).json({ message: "Loan type created", data: loanType });
  } catch (err) {
    console.error(err);
    const status = err.statusCode || 500;
    res.status(status).json({
      error: status === 500 ? "Failed to create loan type" : err.message,
      message: err.message,
    });
  }
};

// Get All Loan Types
exports.getLoanTypes = async (_req, res) => {
  try {
    const types = await prisma.loanType.findMany();
    res.json({
      data: types.map((type) => ({
        ...type,
        rules: normalizeLoanProductRules(type.rules),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch loan types" });
  }
};

// Get One
exports.getLoanTypeById = async (req, res) => {
  try {
    const type = await prisma.loanType.findUnique({
      where: { id: req.params.id },
    });
    if (!type) return res.status(404).json({ error: "Loan type not found" });
    res.json({
      data: {
        ...type,
        rules: normalizeLoanProductRules(type.rules),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch loan type" });
  }
};

exports.getLoanTypeRuleTemplate = async (_req, res) => {
  res.json({
    status: 200,
    data: DEFAULT_LOAN_PRODUCT_RULES,
  });
};

exports.getLoanTypeRules = async (req, res) => {
  try {
    const type = await prisma.loanType.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, label: true, rules: true },
    });

    if (!type) {
      return res.status(404).json({ error: "Loan type not found" });
    }

    return res.json({
      status: 200,
      data: {
        ...type,
        rules: normalizeLoanProductRules(type.rules),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch loan product rules", message: err.message });
  }
};

// Update
exports.updateLoanType = async (req, res) => {
  try {
    const { name, description, label, rules } = req.body;
    const existingType = await prisma.loanType.findUnique({
      where: { id: req.params.id },
    });
    
    if (!existingType) return res.status(404).json({ error: "Loan type not found" });

    const normalizedRules =
      rules === undefined ? existingType.rules : validateLoanProductRules(rules);

    const updated = await prisma.loanType.update({
      where: { id: req.params.id },
      data: { name, description, label, rules: normalizedRules },
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.activity,
      action: "UPDATED LOAN TYPE",
      table: "LoanType",
      targetId: updated.id,
      metadata: updated,
    });

    res.json({ message: "Updated successfully", data: updated });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: status === 500 ? "Failed to update loan type" : err.message,
      message: err.message,
    });
  }
};

exports.updateLoanTypeRules = async (req, res) => {
  try {
    const existingType = await prisma.loanType.findUnique({
      where: { id: req.params.id },
    });

    if (!existingType) {
      return res.status(404).json({ error: "Loan type not found" });
    }

    const normalizedRules = validateLoanProductRules(req.body?.rules);
    const updated = await prisma.loanType.update({
      where: { id: req.params.id },
      data: { rules: normalizedRules },
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.activity,
      action: "UPDATED LOAN TYPE RULES",
      table: "LoanType",
      targetId: updated.id,
      metadata: {
        loanTypeId: updated.id,
        loanTypeName: updated.name,
      },
    });

    return res.json({
      status: 200,
      message: "Loan product rules updated successfully",
      data: {
        ...updated,
        rules: normalizeLoanProductRules(updated.rules),
      },
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: status === 500 ? "Failed to update loan product rules" : err.message,
      message: err.message,
    });
  }
};

// Delete
exports.deleteLoanType = async (req, res) => {
  try {
    await prisma.loanType.delete({ where: { id: req.params.id } });
    res.json({ message: "Loan type deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete loan type" });
  }
};
