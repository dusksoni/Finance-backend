// payment.controller.js
const { differenceInDays } = require("date-fns");
const prisma = require("../lib/prisma");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
const {
  shouldCloseLoan,
  tryAutoTerminateHypothecation,
  processPostPayment,
} = require("../utils/loanUtils");

// --- Utility: calculate fine for any pending principal & dueDate ---
function calculateFine(dueDate, pendingPrincipal) {
  const today = new Date("2026-07-31T12:02:43+05:30");
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

  const fineAmt = parseFloat(
    ((pct / 100) * Number(pendingPrincipal)).toFixed(2)
  );
  return { daysLate, fineAmt, pct };
}

// -----------------------------
// 📋 GET PENDING INSTALLMENTS
// -----------------------------
exports.getPendingPaymentsByLoanId = async (req, res) => {
  try {
    const { loanId } = req.params;
    const today = new Date("2026-07-31T12:02:43+05:30");
    console.log(today);

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
      const { daysLate, fineAmt, pct } = calculateFine(
        inst.paymentFor,
        inst.emiPayAmount - inst.amountPaidSoFar
      );
      const totalDue = parseFloat(
        (inst.emiPayAmount - inst.amountPaidSoFar + fineAmt).toFixed(2)
      );
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

    return res.json({ data: { loanId, pending, grandTotal }, status: 200 });
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
      return res
        .status(400)
        .json({ error: "amountPaid must be more than 0", status: 400 });
    }

    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Get unpaid or partially paid EMIs in order
        const installments = await tx.eMI.findMany({
          where: {
            loanId,
            status: { in: ["UNPAID", "PARTIAL"] },
          },
          orderBy: { paymentFor: "asc" },
          include: {
            loan: {
              include: {
                user: true,
                loanType: true,
                branch: true,
              },
            },
          },
        });

        let remaining = amountPaid;
        const updated = [];
        let lastPayment = null;

        for (const emi of installments) {
          if (remaining <= 0) break;

          const duePrincipal =
            Number(emi.emiPayAmount) - Number(emi.amountPaidSoFar);

          const { fineAmt, daysLate } = calculateFine(
            emi.paymentFor,
            duePrincipal
          );
          const totalDue = duePrincipal + fineAmt;

          const payAmt = Math.min(remaining, totalDue);
          remaining -= payAmt;

          const newPaidSoFar = Number(emi.amountPaidSoFar) + payAmt;
          const isFullyPaid =
            newPaidSoFar >= Number(emi.emiPayAmount) + fineAmt;
          const newStatus = isFullyPaid ? "PAID" : "PARTIAL";
          const verified =
            paymentMode === "CASH"
              ? req.user.type === "ADMIN"
                ? true
                : (await checkVerifyPermission(req.user, "PAYMENT_VERIFY")) // Add await here
                ? true
                : false
              : true;

          // 2. Create Payment
          const payment = await tx.payment.create({
            data: {
              loanId,
              emiId: emi.id,
              amount: payAmt,
              paymentMode,
              transactionId:
                paymentMode === "ONLINE" || paymentMode === "UPI"
                  ? transactionId
                  : null,
              paymentDate,
              status: verified ? "PAID" : "VERIFICATION_PENDING",
              verified,
              verifiedAt: verified ? new Date() : null,
              verifiedByAdminId: req.user.type === "ADMIN" ? req.user.id : null,
              verifiedByEmployeeId:
                req.user.type === "EMPLOYEE" ? req.user.id : null,
              adminId: req.user.type === "ADMIN" ? req.user.id : undefined,
              employeeId:
                req.user.type === "EMPLOYEE" ? req.user.id : undefined,
            },
            include: {
              loan: {
                include: {
                  user: true,
                  loanType: true,
                  branch: true,
                  twoWheelerLoan: true,
                },
              },
              emi: true,
              admin: true,
              employee: true,
            },
          });

          lastPayment = payment;

          // 3. Update EMI
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

          // 4. Only update loan/closure logic if payment is verified
          if (verified) {
            await processPostPayment({
              tx,
              emiId: emi.id,
              loanId,
              paymentAmount: payAmt,
              updateEmiStatus: false, // Already updated EMI above
              userContext: {
                adminId: req.user?.adminId,
                employeeId: req.user?.employeeId,
                type: req.user?.type,
                loginActivityId: req.user?.loginActivityId,
              },
            });
          }

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
      },
      { timeout: 20000 }
    );

    return res.status(200).json({ data: result, status: 200 });
  } catch (err) {
    console.error("Payment Error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Payment failed", status: 500 });
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
        loan: true,
      },
    });
    if (!inst) {
      return res.status(404).json({ error: "Payment not found" });
    }

    return res.json({ status: 200, data: inst });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
// ----------------------------------
// ▶️ GET PAY A SPECIFIC INSTALLMENT ID
// ----------------------------------

exports.getEmiById = async (req, res) => {
  try {
    const { emiId } = req.params;
    const inst = await prisma.eMI.findUnique({
      where: { id: emiId },
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
      data: {
        emiId: inst.id,
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
      },
      status: 200,
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
    const { emiId } = req.params;
    let { amount, paymentMode, transactionId, paymentDate } = req.body;
    amount = Number(amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "amount must be > 0" });
    }
    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const inst = await prisma.eMI.findUnique({ where: { id: emiId } });
    if (!inst) return res.status(404).json({ error: "EMI not found" });

    // Outstanding principal for this EMI
    const duePrincipal =
      Number(inst.emiPayAmount) - Number(inst.amountPaidSoFar);
    const { fineAmt, daysLate } = calculateFine(inst.paymentFor, duePrincipal);
    const totalDue = duePrincipal + fineAmt;

    // Cap payment at total due
    if (amount > totalDue) amount = totalDue;

    const newPaidSoFar = Number(inst.amountPaidSoFar) + amount;
    const isFullyPaid = newPaidSoFar >= Number(inst.emiPayAmount) + fineAmt;
    const newStatus = isFullyPaid ? "PAID" : "PARTIAL";

    // TRANSACTION: create payment, update EMI, update loan
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Payment record
      const payment = await tx.payment.create({
        data: {
          loanId: inst.loanId,
          emiId: emiId,
          amount: amount,
          paymentMode,
          transactionId:
            paymentMode === "ONLINE" || paymentMode === "UPI"
              ? transactionId
              : null,
          paymentDate,
          status: "PAID", // or "VERIFICATION_PENDING" if you want admin approval for cash
          verified: paymentMode === "CASH" ? false : true,
        },
      });

      // 2. Update EMI
      await tx.eMI.update({
        where: { id: emiId },
        data: {
          amountPaidSoFar: newPaidSoFar,
          fineAmount: fineAmt,
          delayDays: daysLate,
          status: newStatus,
          payments: { connect: { id: payment.id } },
        },
      });

      // 3. Update Loan summary
      await tx.loan.update({
        where: { id: inst.loanId },
        data: {
          totalPaidAmount: { increment: amount },
          pendingAmount: { decrement: amount },
        },
      });

      return {
        message: "Payment applied to installment",
        paymentId: payment.id,
        paid: amount,
        emiId,
        emiStatus: newStatus,
      };
    });

    return res.json(result);
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
    const inst = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        emi: true,
        loan: { include: { twoWheelerLoan: true } },
      },
    });
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

    // Transaction for safety
    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark payment as verified
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          verified: true,
          paymentStatus: "APPROVED",
          verifiedByAdminId: isAdmin ? req.user.id : null,
          verifiedByEmployeeId: isEmployee ? req.user.id : null,
        },
      });

      // 2. Update EMI, Loan, closure etc using utility
      const postResult = await processPostPayment({
        tx,
        emiId: inst.emiId,
        loanId: inst.loanId,
        paymentAmount: inst.amount,
        updateEmiStatus: true, // In verify, update EMI (for partial/fully paid)
        userContext: {
          adminId: req.user?.adminId,
          employeeId: req.user?.employeeId,
          type: req.user?.type,
          loginActivityId: req.user?.loginActivityId,
        },
      });

      return { updated, ...postResult };
    });

    return res.json({ message: "Verified", data: result });
  } catch (err) {
    console.error("verifyPayment error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /api/payments/pending-verification?page=1&limit=20&loanId=...&userId=...
exports.getUnverifiedPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, loanId, userId, status } = req.query;

    const where = {
      verified: false,
      ...(loanId ? { loanId } : {}),
      ...(userId ? { loan: { userId } } : {}),
      ...(status ? { status } : { status: "VERIFICATION_PENDING" }),
    };

    const payments = await prisma.payment.findMany({
      where,
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      orderBy: { paymentDate: "desc" },
      include: {
        loan: {
          select: {
            fileNo: true,
            userId: true,
            loanTypeId: true,
            user: {
              select: {
                firstName: true,
                middleName: true,
                lastName: true,
                phone: true,
              },
            },
            loanType: { select: { name: true } },
          },
        },
        emi: true,
        admin: { select: { name: true } },
        employee: { select: { name: true } },
      },
    });

    const total = await prisma.payment.count({ where });

    res.json({
      status: 200,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      data: payments,
    });
  } catch (err) {
    console.error("getUnverifiedPayments error:", err);
    res.status(500).json({ error: err.message });
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
      include: { payments: true, twoWheelerLoan: true },
    });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    // Gather all unpaid installments
    const remaining = loan.payments.filter((p) => p.status !== "PAID");
    const totalPrincipal = remaining.reduce((s, p) => s + p.pendingAmount, 0);
    const monthsLeft = remaining.length;
    const iRate = loan.interestRate / 100;
    const interestSavings = parseFloat(
      (iRate * totalPrincipal * (monthsLeft / 12)).toFixed(2)
    );

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

    // Transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock loan
      await tx.loan.update({
        where: { id: loanId },
        data: { fileStatus: "FORECLOSURE_IN_PROGRESS" },
      });

      // 2. Mark all remaining payments as paid/foreclosure
      for (const p of remaining) {
        await tx.payment.update({
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
        // Also update corresponding EMIs if you keep fine/delay per EMI
        await tx.eMI.update({
          where: { id: p.emiId },
          data: {
            amountPaidSoFar: Number(p.pendingAmount), // or p.emiPayAmount
            fineAmount: calculateFine(p.paymentFor, p.pendingAmount).fineAmt,
            delayDays: calculateFine(p.paymentFor, p.pendingAmount).daysLate,
            status: "PAID",
          },
        });
      }

      // 3. Update loan closure, auto-hypothecation, etc.
      const postResult = await processPostPayment({
        tx,
        loanId,
        paymentAmount: totalRequired,
        updateEmiStatus: false, // Already set all EMIs as paid
        userContext: {
          adminId: req.user?.adminId,
          employeeId: req.user?.employeeId,
          type: req.user?.type,
          loginActivityId: req.user?.loginActivityId,
        },
        forceFullUpdate: true, // Always close loan and handle hypothecation
      });

      // 4. (Optional) Log action
      await tx.actionLog.create({
        data: {
          action: "FORECLOSURE_COMPLETE",
          targetId: loanId,
          table: "Loan",
          metadata: {
            foreclosureAmount: totalRequired,
            penaltyCharges,
            interestSavings,
            totalFine,
            closedAt: new Date(),
          },
        },
      });

      return {
        message: "Loan foreclosed",
        used: totalRequired,
        totalFine,
        interestSavings,
        penaltyCharges,
        hypothecationResult: postResult.hypothecationResult,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.reversePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.status === "REVERSED") {
      return res
        .status(404)
        .json({ error: "Payment not found or already reversed" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "REVERSED", verified: false },
      });

      // Optionally, update EMI and Loan totals
      if (payment.emiId) {
        await tx.eMI.update({
          where: { id: payment.emiId },
          data: { amountPaidSoFar: { decrement: payment.amount } },
        });
      }
      await tx.loan.update({
        where: { id: payment.loanId },
        data: {
          totalPaidAmount: { decrement: payment.amount },
          pendingAmount: { increment: payment.amount },
        },
      });
      // Log action here
    });

    res.json({ message: "Payment reversed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPaymentInvoice = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        loan: {
          include: {
            user: true,
            loanType: true,
            branch: true,
          },
        },
        emi: true,
        admin: true,
        employee: true,
      },
    });

    if (!payment) return res.status(404).json({ error: "Payment not found" });

    const user = payment.loan.user;
    const loan = payment.loan;
    const emi = payment.emi;

    const invoice = {
      invoiceNo: payment.id,
      paymentDate: payment.paymentDate,
      paymentMode: payment.paymentMode,
      amount: payment.amount,
      status: payment.status,
      transactionId: payment.transactionId,
      emiId: emi?.id || null,
      emiDueDate: emi?.paymentFor || null,
      emiAmount: emi?.emiPayAmount || null,
      principal: emi?.principalAmt || null,
      interest: emi?.interestAmt || null,
      user: {
        name: [user.firstName, user.middleName, user.lastName]
          .filter(Boolean)
          .join(" "),
        phone: user.phone,
        email: user.email,
        address: user.address,
      },
      loan: {
        fileNo: loan.fileNo,
        loanType: loan.loanType?.name,
        branch: loan.branch?.name || "-",
      },
      handledBy: payment.admin
        ? payment.admin.name
        : payment.employee
        ? payment.employee.name
        : "-",
    };

    res.json({ invoice });
  } catch (err) {
    console.error("getPaymentInvoice error:", err);
    res.status(500).json({ error: err.message });
  }
};
