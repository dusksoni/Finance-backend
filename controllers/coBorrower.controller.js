const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

exports.addCoBorrower = async (req, res) => {
  try {
    const { loanId, userId, isPrimary, incomeContribution, relationship, kycVerified, consentGiven, consentAt } = req.body;

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const coBorrower = await prisma.loanCoBorrower.create({
      data: {
        loanId, userId, isPrimary: isPrimary ?? false,
        incomeContribution, relationship,
        kycVerified: kycVerified ?? false,
        consentGiven: consentGiven ?? false,
        consentAt: consentAt ? new Date(consentAt) : null,
        addedByAdminId: req.user.adminId,
        addedByEmployeeId: req.user.employeeId,
      },
    });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "CO_BORROWER_ADDED", table: "LoanCoBorrower", targetId: coBorrower.id, metadata: { loanId, userId } });
    res.status(201).json({ message: "Co-borrower added", data: coBorrower });
  } catch (err) {
    res.status(500).json({ error: "Failed to add co-borrower", message: err.message });
  }
};

exports.listCoBorrowers = async (req, res) => {
  try {
    const { loanId, userId } = req.query;
    const where = {};
    if (loanId) where.loanId = loanId;
    if (userId) where.userId = userId;
    const coBorrowers = await prisma.loanCoBorrower.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } } },
    });
    res.json({ data: coBorrowers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch co-borrowers" });
  }
};

exports.updateCoBorrower = async (req, res) => {
  try {
    const { isPrimary, incomeContribution, relationship, kycVerified, consentGiven, consentAt } = req.body;
    const coBorrower = await prisma.loanCoBorrower.update({
      where: { id: req.params.id },
      data: { isPrimary, incomeContribution, relationship, kycVerified, consentGiven, consentAt: consentAt ? new Date(consentAt) : undefined },
    });
    res.json({ message: "Co-borrower updated", data: coBorrower });
  } catch (err) {
    res.status(500).json({ error: "Failed to update co-borrower", message: err.message });
  }
};

exports.removeCoBorrower = async (req, res) => {
  try {
    await prisma.loanCoBorrower.delete({ where: { id: req.params.id } });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "CO_BORROWER_REMOVED", table: "LoanCoBorrower", targetId: req.params.id });
    res.json({ message: "Co-borrower removed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove co-borrower", message: err.message });
  }
};
