const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

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
    const loanType = await prisma.loanType.create({
      data: { name, description, label, rules },
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
    res.status(500).json({ error: "Failed to create loan type", message: err.message });
  }
};

// Get All Loan Types
exports.getLoanTypes = async (_req, res) => {
  try {
    const types = await prisma.loanType.findMany();
    res.json({ data: types });
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
    res.json({ data: type });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch loan type" });
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

    const updated = await prisma.loanType.update({
      where: { id: req.params.id },
      data: { name, description, label, rules },
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.activity,
      action: "CREATED LOAN TYPE",
      table: "LoanType",
      targetId: updated.id,
      metadata: updated,
    });

    res.json({ message: "Updated successfully", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update loan type", message: err.message });
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
