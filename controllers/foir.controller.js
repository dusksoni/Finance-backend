const prisma = require("../lib/prisma");
const { reducingBalanceEMI } = require("./loan.controller");

/**
 * Calculate FOIR (Fixed Obligation to Income Ratio) for a user.
 * FOIR = (Sum of all active EMIs + proposed EMI) / Monthly Income
 */
async function computeFOIR(userId, proposedEmiAmount = 0) {
  // Get all active loans for the user
  const activeLoans = await prisma.loan.findMany({
    where: {
      userId,
      isClosed: false,
      isDeleted: false,
      fileStatus: { in: ["ACTIVE", "OVERDUE", "DEFAULTED", "UNDER_COLLECTION"] },
    },
    select: { monthlyPayableAmount: true },
  });

  const existingEmiTotal = activeLoans.reduce((s, l) => s + Number(l.monthlyPayableAmount || 0), 0);
  const totalObligations = existingEmiTotal + Number(proposedEmiAmount || 0);

  // Get declared income from user profile (via proofOfIncome or from application)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { proofOfIncome: true },
  });

  // proofOfIncome may store the amount or a doc reference; try parsing as number
  const declaredIncome = Number(user?.proofOfIncome) || null;

  const foir = declaredIncome ? totalObligations / declaredIncome : null;

  return {
    userId,
    existingEmiTotal,
    proposedEmiAmount: Number(proposedEmiAmount),
    totalObligations,
    declaredMonthlyIncome: declaredIncome,
    foirPercent: foir !== null ? Math.round(foir * 10000) / 100 : null, // e.g. 45.00%
    foirStatus: foir === null ? "INCOME_UNKNOWN" : foir <= 0.5 ? "ELIGIBLE" : foir <= 0.65 ? "MARGINAL" : "INELIGIBLE",
    activeLoansCount: activeLoans.length,
  };
}

exports.getFOIR = async (req, res) => {
  try {
    const { userId } = req.params;
    const { proposedEmiAmount, proposedPrincipal, proposedRate, proposedTenure } = req.query;

    let proposedEmi = Number(proposedEmiAmount) || 0;

    // If raw loan params are provided, compute EMI using reducing balance
    if (!proposedEmi && proposedPrincipal && proposedRate && proposedTenure) {
      proposedEmi = reducingBalanceEMI(Number(proposedPrincipal), Number(proposedRate), Number(proposedTenure));
    }

    const result = await computeFOIR(userId, proposedEmi);
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: "Failed to calculate FOIR", message: err.message });
  }
};

exports.checkEligibility = async (req, res) => {
  try {
    const { userId, principalLoanAmount, interestRate, tenureMonths, monthlyIncome } = req.body;

    const proposedEmi = reducingBalanceEMI(Number(principalLoanAmount), Number(interestRate), Number(tenureMonths));
    const result = await computeFOIR(userId, proposedEmi);

    // Override declared income if provided
    if (monthlyIncome) {
      result.declaredMonthlyIncome = Number(monthlyIncome);
      const foir = result.totalObligations / Number(monthlyIncome);
      result.foirPercent = Math.round(foir * 10000) / 100;
      result.foirStatus = foir <= 0.5 ? "ELIGIBLE" : foir <= 0.65 ? "MARGINAL" : "INELIGIBLE";
    }

    res.json({ data: { ...result, proposedEmiAmount: proposedEmi } });
  } catch (err) {
    res.status(500).json({ error: "Failed to check eligibility", message: err.message });
  }
};

module.exports.computeFOIR = computeFOIR;
