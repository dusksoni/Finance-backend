const { differenceInDays } = require("date-fns");
const prisma = require("../lib/prisma");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");

function calculateFine(dueDate, pendingPrincipal) {
  const today = new Date("Tue Jan 07 2026 19:28:47 GMT+0530 (India Standard Time)");
  const daysLate = Math.max(differenceInDays(today, dueDate), 0);
  let pct = 0;
  if (daysLate > 7 && daysLate <= 20) pct = 2.5;
  else if (daysLate > 20 && daysLate <= 30) pct = 5;
  else if (daysLate > 30) {
    let extraMonths = Math.ceil((daysLate - 30)/30);
    pct = 5 + extraMonths*5;
  }
  const fineAmt = parseFloat(((pct/100)*Number(pendingPrincipal)));
  return { daysLate, fineAmt, pct };
}

exports.getPendingPaymentsByLoanId = async (req, res) => {
  try {
    const { loanId } = req.params;
    const today = new Date("Tue Jan 07 2026 19:28:47 GMT+0530 (India Standard Time)");

    // load future & unpaid installments
    const installments = await prisma.payment.findMany({
      where: { loanId, status: { in: ["UNPAID","PARTIAL"] }, paymentFor: { lte: today } },
      orderBy: { paymentFor: "asc" },
    });

    let grandTotal = 0;
    const enriched = installments.map((inst) => {
      const { fineAmt, daysLate, pct } = calculateFine(inst.paymentFor, inst.emiPayAmount);
      console.log(fineAmt, daysLate, pct);
      const totalDue = parseFloat((Number(inst.emiPayAmount) + fineAmt));
      grandTotal += totalDue;
      return {
        id: inst.id,
        paymentFor: inst.paymentFor,
        emiPayAmount: Number(inst.emiPayAmount),
        principalAmt: inst.principalAmt,
        interestAmt: inst.interestAmt,
        fineAmount: fineAmt,
        delayDays: daysLate,
        finePercentage: pct,
        total: totalDue,
      };
    });

    return res.json({ loanId, pendingPayments: enriched, grandTotal });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.makePayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { amountPaid, paymentMode, transactionId, paymentDate } = req.body;
    if (amountPaid <= 0) throw new Error("Invalid amount");

    // fetch unpaid installments in order
    const installments = await prisma.payment.findMany({
      where: { loanId, status: { in: ["UNPAID","PARTIAL"] } },
      orderBy: { paymentFor: "asc" },
    });

    let remaining = amountPaid;
    const updated = [];

    for (const inst of installments) {
      if (remaining <= 0) break;

      // re-calc fine & total due
      const { fineAmt } = calculateFine(inst.paymentFor, inst.principalAmt);
      const totalDue = inst.emiPayAmount + fineAmt - inst.amountPaidSoFar;

      // pay up to totalDue
      const pay = Math.min(remaining, totalDue);
      remaining -= pay;

      // determine new status
      const newPaid = inst.amountPaidSoFar + pay;
      const isFullyPaid = newPaid >= (inst.emiPayAmount + fineAmt);
      const newStatus = isFullyPaid ? "PAID" : "PARTIAL";

      // update record
      await prisma.payment.update({
        where: { id: inst.id },
        data: {
          amountPaidSoFar: newPaid,
          fineAmount: fineAmt,
          delayDays: daysLate,
          status: newStatus,
          paymentMode,
          transactionId,
          paymentDate: paymentDate || new Date(),
        },
      });

      // reduce loan’s pendingAmount, totalPaidAmount
      await prisma.loan.update({
        where: { id: loanId },
        data: {
          pendingAmount: { decrement: pay },
          totalPaidAmount: { increment: pay },
        },
      });

      updated.push({ id: inst.id, paid: pay, status: newStatus });
    }

    return res.json({ message: "Payment applied", used: amountPaid - remaining, updated });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
};


exports.verifyPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.verified) return res.status(400).json({ error: "Invalid or already verified payment." });

    const isAdmin = req.user.type === "ADMIN";
    const isEmployee = req.user.type === "EMPLOYEE" && await checkVerifyPermission(req.user.id);

    if (!isAdmin && !isEmployee) return res.status(403).json({ error: "Unauthorized." });

    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        verified: true,
        paymentStatus: "APPROVED",
        verifiedByAdminId: isAdmin ? req.user.id : null,
        verifiedByEmployeeId: isEmployee ? req.user.id : null,
      },
    });

    await prisma.loan.update({
      where: { id: payment.loanId },
      data: {
        totalPaidAmount: { increment: payment.paidAmount },
        pendingAmount: { decrement: payment.paidAmount },
      },
    });

    return res.status(200).json({ message: "Verified", data: updatedPayment });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
exports.getForeclosureDetails = async (req, res) => {
  try {
    const { loanId } = req.params;

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { payments: true },
    });

    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const remainingPayments = loan.payments.filter(p => !p.isPaid);
    const totalRemainingPrincipal = remainingPayments.reduce((sum, p) => sum + parseFloat(p.pendingAmount), 0);

    const remainingMonths = remainingPayments.length;
    const interestRate = parseFloat(loan.interestRate);
    const totalRemainingInterest = parseFloat(((interestRate / 100) * totalRemainingPrincipal * (remainingMonths / 12)).toFixed(2));

    const unpaidFine = remainingPayments.reduce((sum, p) => {
      const fine = calculateFine(p.paymentFor, p.pendingAmount);
      return sum + fine.fineAmount;
    }, 0);

    const outstandingBalance = totalRemainingPrincipal;
    const penaltyCharges = parseFloat((outstandingBalance * (loan.penaltyPercentage / 100)).toFixed(2));
    const foreclosureAmount = outstandingBalance + penaltyCharges + unpaidFine + totalRemainingInterest;

    return res.status(200).json({
      loanId,
      outstandingBalance,
      unpaidFine,
      penaltyCharges,
      totalRemainingPrincipal,
      totalRemainingInterest,
      foreclosureAmount,
    });
  } catch (err) {
    console.error("getForeclosureDetails error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.postForeclosurePayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { amountPaid, paymentMode, transactionId, paymentDate } = req.body;

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { payments: true },
    });

    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const remainingPayments = loan.payments.filter(p => !p.isPaid);

    const totalRemainingPrincipal = remainingPayments.reduce((sum, p) => sum + parseFloat(p.pendingAmount), 0);
    const remainingMonths = remainingPayments.length;
    const interestRate = parseFloat(loan.interestRate);
    const totalRemainingInterest = parseFloat(((interestRate / 100) * totalRemainingPrincipal * (remainingMonths / 12)).toFixed(2));

    let totalFine = 0;
    let updatedPaymentIds = [];

    for (const payment of remainingPayments) {
      const fine = calculateFine(payment.paymentFor, payment.pendingAmount);
      totalFine += fine.fineAmount;

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          fineAmount: fine.fineAmount,
          delayDays: fine.delayDays,
          isDelayed: fine.delayDays > 0,
          isPaid: true,
          status: "PAID",
          paidAmount: parseFloat(payment.pendingAmount),
          pendingAmount: 0,
          isForeclosure: true,
          paymentMode,
          transactionId,
          paymentDate: paymentDate || new Date(),
        },
      });

      updatedPaymentIds.push(updated.id);
    }

    const penaltyCharges = parseFloat((totalRemainingPrincipal * (loan.penaltyPercentage / 100)).toFixed(2));
    const totalForeclosureAmount = totalRemainingPrincipal + totalFine + penaltyCharges + totalRemainingInterest;

    if (amountPaid < totalForeclosureAmount) {
      return res.status(400).json({ error: "Insufficient payment for foreclosure." });
    }

    let verified = false;
    let verifiedByAdminId = null;
    let verifiedByEmployeeId = null;

    if (req.user.type === "ADMIN") {
      verified = true;
      verifiedByAdminId = req.user.id;
    } else if (req.user.type === "EMPLOYEE") {
      const employee = await prisma.employee.findUnique({
        where: { id: req.user.id },
        include: { role: { include: { permissions: true } } },
      });

      const canVerify = employee?.role?.permissions.some(p => p.name === "VERIFY_PAYMENT");
      if (canVerify) {
        verified = true;
        verifiedByEmployeeId = req.user.id;
      }
    }

    if (verified) {
      await prisma.loan.update({
        where: { id: loanId },
        data: {
          isClosed: true,
          totalPaidPrincipal: loan.totalPaidPrincipal + totalRemainingPrincipal,
          totalPaidFine: loan.totalPaidFine + totalFine,
          totalPaidInterest: loan.totalPaidInterest + totalRemainingInterest,
          totalPaidAmount: loan.totalPaidAmount + totalForeclosureAmount,
          pendingAmount: 0,
          actualEndDate: new Date(),
        },
      });
    }

    return res.status(200).json({
      message: "Loan foreclosed successfully.",
      usedAmount: totalForeclosureAmount,
      unpaidFine: totalFine,
      penaltyCharges,
      totalRemainingInterest,
      verified,
      verifiedByAdminId,
      verifiedByEmployeeId,
      updatedPaymentIds,
    });
  } catch (err) {
    console.error("postForeclosurePayment error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};