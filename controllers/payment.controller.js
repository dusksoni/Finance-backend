const { differenceInDays } = require("date-fns");
const prisma = require("../lib/prisma");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");


function calculateFine(dueDate, pendingAmount) {
  const today = new Date();
  const delayDays = Math.max(differenceInDays(today, new Date(dueDate)), 0);
  let finePercentage = 0;

  if (delayDays > 7 && delayDays <= 20) {
    finePercentage = 2.5;
  } else if (delayDays > 20 && delayDays <= 30) {
    finePercentage = 5;
  } else if (delayDays > 30) {
    const monthsLate = Math.floor((delayDays - 30) / 30) + 1;
    finePercentage = 5 + monthsLate * 5;
  }

  const fineAmount = parseFloat(((finePercentage / 100) * pendingAmount).toFixed(2));
  const total = parseFloat((pendingAmount + fineAmount).toFixed(2));

  return { finePercentage, fineAmount, total, delayDays };
}

exports.getPendingPaymentsByLoanId = async (req, res) => {
  try {
    const { loanId } = req.params;
    const today = new Date();

    const payments = await prisma.payment.findMany({
      where: {
        loanId,
        paymentFor: { lte: today },
        status: { in: ["UNPAID", "PARTIAL"] },
      },
      orderBy: { paymentFor: "asc" },
    });

    const updatedPayments = await Promise.all(
      payments.map(async (payment) => {
        const fine = calculateFine(payment.paymentFor, payment.pendingAmount);
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            fineAmount: fine.fineAmount,
            delayDays: fine.delayDays,
            isDelayed: fine.delayDays > 0,
          },
        });
        return { ...payment, ...fine, total: fine.total };
      })
    );

    const grandTotal = updatedPayments.reduce((sum, p) => sum + p.total, 0);
    return res.status(200).json({ loanId, pendingPayments: updatedPayments, grandTotal });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.makePayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { amountPaid, paymentMode, transactionId, paymentDate } = req.body;

    if (amountPaid <= 0) return res.status(400).json({ error: "Invalid payment amount." });

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) return res.status(404).json({ error: "Loan not found." });

    const payments = await prisma.payment.findMany({
      where: { loanId, status: { in: ["UNPAID", "PARTIAL"] } },
      orderBy: { paymentFor: "asc" },
    });

    let remainingAmount = amountPaid;
    const isOnline = ["ONLINE", "UPI"].includes(paymentMode);
    const updatedPayments = [];

    for (let payment of payments) {
      const fine = calculateFine(payment.paymentFor, payment.pendingAmount);
      const totalDue = payment.pendingAmount + fine.fineAmount;
      if (remainingAmount <= 0) break;

      let paid = Math.min(remainingAmount, totalDue);
      remainingAmount -= paid;

      const isPaid = paid >= totalDue;
      const status = isPaid ? "PAID" : "PARTIAL";
      const verified = req.user.type === "ADMIN" || (req.user.type === "EMPLOYEE" && await checkVerifyPermission(req.user, "VERIFY_PAYMENT"));
      const verifiedByAdminId = req.user.type === "ADMIN" ? req.user.id : null;
      const verifiedByEmployeeId = req.user.type === "EMPLOYEE" ? req.user.id : null;

      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          paidAmount: payment.paidAmount + paid,
          pendingAmount: Math.max(totalDue - (payment.paidAmount + paid), 0),
          status,
          isPaid,
          paymentStatus: verified ? "APPROVED" : "PENDING",
          paymentMode,
          transactionId: isOnline ? transactionId : null,
          fineAmount: fine.fineAmount,
          delayDays: fine.delayDays,
          isDelayed: fine.delayDays > 0,
          verified,
          verifiedByAdminId,
          verifiedByEmployeeId,
          paymentDate: paymentDate || new Date(),
        },
      });

      if (verified) {
        await prisma.loan.update({
          where: { id: loanId },
          data: {
            totalPaidAmount: { increment: paid },
            pendingAmount: { decrement: paid },
          },
        });
      }

      updatedPayments.push(updatedPayment);
    }

    return res.status(200).json({ message: "Payment processed", usedAmount: amountPaid - remainingAmount, updatedPayments });
  } catch (error) {
    return res.status(500).json({ error: error.message });
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