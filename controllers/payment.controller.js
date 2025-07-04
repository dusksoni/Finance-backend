// payment.controller.js
const { differenceInDays } = require("date-fns");
const prisma = require("../lib/prisma");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");

// --- Utility: calculate fine for any pending principal & dueDate ---
function calculateFine(dueDate, pendingPrincipal) {
  const today = new Date();
  const daysLate = Math.max(differenceInDays(today, dueDate), 0);

  if (!pendingPrincipal || isNaN(pendingPrincipal)) {
    return { daysLate: 0, fineAmt: 0, pct: 0 };
  }

  let pct = 0;

  // Fine slabs
  if (daysLate > 7 && daysLate <= 20) {
    pct = 2.5; // 2.5% fine between 8 to 20 days
  } else if (daysLate > 20 && daysLate <= 30) {
    pct = 5; // 5% fine between 21 to 30 days
  } else if (daysLate > 30) {
    const extraMonths = Math.ceil((daysLate - 30) / 30);
    pct = 5 + extraMonths * 5; // 5% + 5% for each month after 30 days
  }

  const fineAmt = parseFloat(((pct / 100) * Number(pendingPrincipal)).toFixed(2));
  return { daysLate, fineAmt, pct };
}

// -----------------------------
// 📋 GET PENDING INSTALLMENTS
// -----------------------------
exports.getPendingPaymentsByLoanId = async (req, res) => {
  try {
    const { loanId } = req.params;
    const today = new Date();

    const installments = await prisma.eMI.findMany({
      where: {
        loanId,
        status: { in: ["UNPAID", "PARTIAL"] },
        paymentFor: { lte: today },
      },
      orderBy: { paymentFor: "asc" },
    });

    let grandTotal = 0;
    const pending = installments.map((inst) => {
      const { daysLate, fineAmt, pct } = calculateFine(inst.paymentFor, inst.emiPayAmount - inst.amountPaidSoFar);
      const totalDue = parseFloat((inst.emiPayAmount - inst.amountPaidSoFar + fineAmt).toFixed(2));
      grandTotal += totalDue;
      return {
        emiId: inst.id,
        paymentFor: inst.paymentFor,
        emiPayAmount: inst.emiPayAmount,
        alreadyPaid: inst.amountPaidSoFar,
        principalAmt: inst.principalAmt,
        interestAmt: inst.interestAmt,
        fineAmount: fineAmt,
        delayDays: daysLate,
        finePercentage: pct,
        totalDue,
      };
    });

    return res.json({ loanId, pending, grandTotal });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// -----------------------------------
// ▶️ MAKE PAYMENT AGAINST PENDING DUES
// -----------------------------------
// Applies a lump sum across all current pending installments in order.
// Overpayment spills into future installments (advance pay).
exports.makePayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    let { amountPaid, paymentMode, transactionId, paymentDate } = req.body;

    amountPaid = Number(amountPaid);
    if (!amountPaid || amountPaid <= 0) {
      return res.status(400).json({ error: "amountPaid must be more than 0" });
    }

    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Get unpaid or partially paid EMIs in order
      const installments = await tx.eMI.findMany({
        where: {
          loanId,
          status: { in: ["UNPAID", "PARTIAL"] },
        },
        orderBy: { paymentFor: "asc" },
      });

      let remaining = amountPaid;
      const updated = [];

      for (const emi of installments) {
        if (remaining <= 0) break;

        const duePrincipal = Number(emi.emiPayAmount) - Number(emi.amountPaidSoFar);

        const { fineAmt, daysLate } = calculateFine(emi.paymentFor, duePrincipal);
        const totalDue = duePrincipal + fineAmt;

        const payAmt = Math.min(remaining, totalDue);
        remaining -= payAmt;

        const newPaidSoFar = Number(emi.amountPaidSoFar) + payAmt;
        const isFullyPaid = newPaidSoFar >= Number(emi.emiPayAmount) + fineAmt;
        const newStatus = isFullyPaid ? "PAID" : "PARTIAL";
        const verified = paymentMode === "CASH" ? req.user.type === "ADMIN" ? true : checkVerifyPermission(req.user, "PAYMENT_VERIFY") ? true : false : true;

        // Create Payment
        const payment = await tx.payment.create({
          data: {
            loanId,
            emi: { connect: { id: emi.id } },
            amount: payAmt,
            paymentMode,
            transactionId:
              paymentMode === "ONLINE" || paymentMode === "UPI" ? transactionId : null,
            paymentDate,
            status: verified ? "PAID" : "VERIFICATION_PENDING",
            verified: verified,
            verifiedAt: verified ? new Date() : null,
            verifiedByAdminId: req.user.type === "ADMIN" ? {
              connect: { id: req.user.id }
            } : null,
            verifiedByEmployeeId: req.user.type === "EMPLOYEE" ? {
              connect: { id: req.user.id }
            } : null,

            admin: req.user.type === "ADMIN" ? { connect: { id: req.user.id } } : undefined,
            employee: req.user.type === "EMPLOYEE" ? { connect: { id: req.user.id } } : undefined, 
            
          },
        });

        // Update EMI
        await tx.eMI.update({
          where: { id: emi.id },
          data: {
            amountPaidSoFar: newPaidSoFar,
            fineAmount: fineAmt,
            delayDays: daysLate,
            verified: verified,
            status: verified ? newStatus : "VERIFICATION_PENDING",
            payments: {
              connect: { id: payment.id },
            },
          },
        });

        // Update Loan Summary
        await tx.loan.update({
          where: { id: loanId },
          data: {
            totalPaidAmount: { increment: payAmt },
            pendingAmount: { decrement: payAmt },
          },
        });

        updated.push({
          emiId: emi.id,
          paidAmount: payAmt,
          emiStatus: newStatus,
          fineApplied: fineAmt,
          daysLate,
        });
      }

      return {
        message: "Payment processed",
        usedAmount: amountPaid - remaining,
        unallocatedAmount: remaining,
        updatedInstallments: updated,
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("Payment Error:", err);
    return res.status(500).json({ error: err.message || "Payment failed" });
  }
};

// ----------------------------------
// ▶️ GET PAY A SPECIFIC INSTALLMENT ID
// ----------------------------------

exports.getPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const inst = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        loan: {
          select: {
            interestRate: true,
            penaltyPercentage: true,
            paymentFrequency: true,
          },
        },
      },
    });
    if (!inst) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // outstanding principal = EMI - already paid
    const outstandingPrincipal = parseFloat(
      (inst.emiPayAmount - inst.amountPaidSoFar).toFixed(2)
    );
    // compute fine based on outstanding principal
    const { daysLate, fineAmt, pct } = calculateFine(
      inst.paymentFor,
      outstandingPrincipal
    );
    // total due = outstanding principal + fine
    const totalDue = parseFloat((outstandingPrincipal + fineAmt).toFixed(2));

    return res.json({
      paymentId: inst.id,
      loanId: inst.loanId,
      paymentFor: inst.paymentFor,
      paymentDate: inst.paymentDate,
      emiPayAmount: inst.emiPayAmount,
      amountPaidSoFar: inst.amountPaidSoFar,
      outstandingPrincipal,
      interestRate: inst.loan.interestRate,
      finePercentage: pct,
      fineAmount: fineAmt,
      daysLate,
      totalDue,
      status: inst.status,
      paymentStatus: inst.paymentStatus,
      paymentMode: inst.paymentMode,
      transactionId: inst.transactionId,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// ----------------------------------
// ▶️ PAY A SPECIFIC INSTALLMENT ID
// ----------------------------------
exports.payPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;
    let { amount, paymentMode, transactionId, paymentDate } = req.body;
    amount = Number(amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "amount must be > 0" });
    }
    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    // fetch that installment
    const inst = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!inst) return res.status(404).json({ error: "Payment not found" });

    // calculate outstanding portion & fine
    const duePrincipal = inst.emiPayAmount - inst.amountPaidSoFar;
    const { fineAmt } = calculateFine(inst.paymentFor, duePrincipal);
    const totalDue = duePrincipal + fineAmt;

    if (amount > totalDue) amount = totalDue; // cap at totalDue

    const newPaidSoFar = inst.amountPaidSoFar + amount;
    const isFullyPaid = newPaidSoFar >= inst.emiPayAmount + fineAmt;
    const newStatus = isFullyPaid ? "PAID" : "PARTIAL";

    // update installment
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        amountPaidSoFar: newPaidSoFar,
        fineAmount: fineAmt,
        delayDays: calculateFine(inst.paymentFor, duePrincipal).daysLate,
        status: newStatus,
        paymentMode,
        transactionId:
          paymentMode === "ONLINE" || paymentMode === "UPI"
            ? transactionId
            : null,
        paymentDate,
      },
    });

    // update loan summary
    await prisma.loan.update({
      where: { id: inst.loanId },
      data: {
        totalPaidAmount: { increment: amount },
        pendingAmount: { decrement: amount },
      },
    });

    return res.json({
      message: "Payment applied to installment",
      paymentId,
      paid: amount,
      status: newStatus,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// ✅ VERIFY PAYMENT RECORD
// ---------------------------
exports.verifyPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const inst = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!inst || inst.verified) {
      return res.status(400).json({ error: "Already verified or not found" });
    }

    const isAdmin = req.user.type === "ADMIN";
    const isEmployee =
      req.user.type === "EMPLOYEE" &&
      (await checkVerifyPermission(req.user, "VERIFY_PAYMENT"));
    if (!isAdmin && !isEmployee) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // mark verified
    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        verified: true,
        paymentStatus: "APPROVED",
        verifiedByAdminId: isAdmin ? req.user.id : null,
        verifiedByEmployeeId: isEmployee ? req.user.id : null,
      },
    });

    // update loan totals only once verification matters
    await prisma.loan.update({
      where: { id: inst.loanId },
      data: {
        totalPaidAmount: { increment: inst.amountPaidSoFar },
        pendingAmount: { decrement: inst.amountPaidSoFar },
      },
    });

    return res.json({ message: "Verified", data: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// 📉 FORECLOSURE CALCULATIONS
// ---------------------------
exports.getForeclosureDetails = async (req, res) => {
  try {
    const { loanId } = req.params;
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { payments: true },
    });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    // only those not paid yet
    const remaining = loan.payments.filter((p) => p.status !== "PAID");
    const totalPrincipal = remaining.reduce((s, p) => s + p.pendingAmount, 0);
    const monthsLeft = remaining.length;
    const iRate = loan.interestRate / 100;

    // interest savings if foreclosed
    const interestSavings = parseFloat(
      (iRate * totalPrincipal * (monthsLeft / 12)).toFixed(2)
    );

    // unpaid fines
    const unpaidFine = remaining.reduce((s, p) => {
      const { fineAmt } = calculateFine(p.paymentFor, p.pendingAmount);
      return s + fineAmt;
    }, 0);

    const penaltyCharges = parseFloat(
      (totalPrincipal * (loan.penaltyPercentage / 100)).toFixed(2)
    );

    const foreclosureAmount = parseFloat(
      (totalPrincipal + unpaidFine + penaltyCharges + interestSavings).toFixed(
        2
      )
    );

    return res.json({
      loanId,
      totalPrincipal,
      interestSavings,
      unpaidFine,
      penaltyCharges,
      foreclosureAmount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// --------------------------------
// 💳 POST FORECLOSURE PAYMENT
// --------------------------------
exports.postForeclosurePayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    let { amountPaid, paymentMode, transactionId, paymentDate } = req.body;
    paymentDate = paymentDate ? new Date(paymentDate) : new Date();
    amountPaid = Number(amountPaid);
    if (!amountPaid || amountPaid <= 0) {
      return res.status(400).json({ error: "amountPaid must be > 0" });
    }

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { payments: true },
    });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    // gather all unpaid installments
    const remaining = loan.payments.filter((p) => p.status !== "PAID");
    const totalPrincipal = remaining.reduce((s, p) => s + p.pendingAmount, 0);

    const monthsLeft = remaining.length;
    const iRate = loan.interestRate / 100;
    const interestSavings = parseFloat(
      (iRate * totalPrincipal * (monthsLeft / 12)).toFixed(2)
    );

    // sum fines
    let totalFine = 0;
    for (const p of remaining) {
      const { fineAmt } = calculateFine(p.paymentFor, p.pendingAmount);
      totalFine += fineAmt;
    }

    const penaltyCharges = parseFloat(
      (totalPrincipal * (loan.penaltyPercentage / 100)).toFixed(2)
    );

    const totalRequired = parseFloat(
      (totalPrincipal + interestSavings + totalFine + penaltyCharges).toFixed(2)
    );
    if (amountPaid < totalRequired) {
      return res
        .status(400)
        .json({ error: "Insufficient amount for foreclosure" });
    }

    // mark all as paid/foreclosure
    for (const p of remaining) {
      await prisma.payment.update({
        where: { id: p.id },
        data: {
          status: "PAID",
          isForeclosure: true,
          paidAmount: p.pendingAmount,
          pendingAmount: 0,
          fineAmount: calculateFine(p.paymentFor, p.pendingAmount).fineAmt,
          delayDays: calculateFine(p.paymentFor, p.pendingAmount).daysLate,
          paymentMode,
          transactionId,
          paymentDate,
        },
      });
    }

    // update loan
    await prisma.loan.update({
      where: { id: loanId },
      data: {
        isClosed: true,
        totalPaidAmount: { increment: totalRequired },
        pendingAmount: 0,
        totalPaidFine: { increment: totalFine },
        totalPaidInterest: { increment: interestSavings },
        totalPaidPrincipal: { increment: totalPrincipal },
        actualEndDate: new Date(),
      },
    });

    return res.json({
      message: "Loan foreclosed",
      used: totalRequired,
      totalFine,
      interestSavings,
      penaltyCharges,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
