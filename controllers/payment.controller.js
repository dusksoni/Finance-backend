// payment.controller.js
const prisma = require("../lib/prisma");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
const {
  shouldCloseLoan,
  tryAutoTerminateHypothecation,
  processPostPayment,
} = require("../utils/loanUtils");
const { calculateFine } = require("../utils/calculateFine");

// --- Utility: calculate fine for any pending principal & dueDate ---
// -----------------------------
// 📋 GET PENDING INSTALLMENTS
// -----------------------------
exports.getPendingPaymentsByLoanId = async (req, res) => {
  try {
    const { loanId } = req.params;
    const today = new Date();
    const H24_MS = 24 * 60 * 60 * 1000;

    // 0) gate: refresh fines if last update ≥ 24h
    const lastOpen = await prisma.eMI.findFirst({
      where: {
        loanId,
        status: { in: ["UNPAID", "PARTIAL"] },
        paymentFor: { lte: today },
      },
      select: { updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });

    if (!lastOpen || today - new Date(lastOpen.updatedAt) >= H24_MS) {
      const toRefresh = await prisma.eMI.findMany({
        where: {
          loanId,
          status: { in: ["UNPAID", "PARTIAL"] },
          paymentFor: { lte: today },
        },
        select: {
          id: true,
          paymentFor: true,
          emiPayAmount: true,
          amountPaidSoFar: true,
          fineAmount: true,
          delayDays: true,
        },
      });

      const updates = [];
      for (const e of toRefresh) {
        const outstanding = Math.max(
          Number(e.emiPayAmount || 0) - Number(e.amountPaidSoFar || 0),
          0
        );
        const { daysLate, fineAmt } = calculateFine(e.paymentFor, outstanding);
        const newFine = Number((Number(fineAmt) || 0).toFixed(2));
        const newDelay = Number(daysLate || 0);
        const isDelayed = newDelay > 0;

        if (
          Number(e.fineAmount || 0) !== newFine ||
          Number(e.delayDays || 0) !== newDelay
        ) {
          updates.push(
            prisma.eMI.update({
              where: { id: e.id },
              data: { fineAmount: newFine, delayDays: newDelay, isDelayed },
            })
          );
        }
      }
      if (updates.length)
        await prisma.$transaction(updates, { timeout: 20000 });
    }

    // 1) fetch pending list (<= today)
    const installments = await prisma.eMI.findMany({
      where: {
        loanId,
        status: { in: ["UNPAID", "PARTIAL"] },
        paymentFor: { lte: today },
      },
      orderBy: { paymentFor: "asc" },
    });

    // 2) compute response fields
    let grandTotal = 0;
    const pending = installments.map((inst) => {
      const outstanding = Math.max(
        Number(inst.emiPayAmount || 0) - Number(inst.amountPaidSoFar || 0),
        0
      );
      const fineAlreadyPaid = Number(inst.finePaid || 0);
      const { daysLate, fineAmt, pct } = calculateFine(
        inst.paymentFor,
        outstanding
      );
      const fineAssessed = Number((Number(fineAmt) || 0).toFixed(2));
      const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);
      const totalDue = Number((outstanding + fineDue).toFixed(2));

      return {
        emiId: inst.id,
        paymentFor: inst.paymentFor,
        emiPayAmount: Number(inst.emiPayAmount),
        alreadyPaid: Number(inst.amountPaidSoFar),
        principalAmt: Number(inst.principalAmt),
        interestAmt: Number(inst.interestAmt),
        fineAssessed,
        finePaid: fineAlreadyPaid,
        fineDue,
        delayDays: daysLate,
        finePercentage: pct,
        totalDue,
      };
    });

    return res.json({
      data: { loanId, pending, grandTotal: Number(grandTotal.toFixed(2)) },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// -----------------------------------
// ▶️ MAKE PAYMENT AGAINST PENDING DUES
// -----------------------------------
exports.makePayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    let { amountPaid, paymentMode, transactionId, paymentDate } = req.body;

    const r2 = (n) => Number((Number(n) || 0).toFixed(2));

    amountPaid = r2(Number(amountPaid));
    if (!amountPaid || amountPaid <= 0) {
      return res
        .status(400)
        .json({ error: "amountPaid must be more than 0", status: 400 });
    }

    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const result = await prisma.$transaction(
      async (tx) => {
        // (A) refresh fines for overdue open EMIs if last update ≥ 24h
        const today = new Date();
        const H24_MS = 24 * 60 * 60 * 1000;

        const lastOpen = await tx.eMI.findFirst({
          where: {
            loanId,
            status: { in: ["UNPAID", "PARTIAL"] },
            paymentFor: { lte: today },
          },
          select: { updatedAt: true },
          orderBy: { updatedAt: "desc" },
        });

        if (!lastOpen || today - new Date(lastOpen.updatedAt) >= H24_MS) {
          const toRefresh = await tx.eMI.findMany({
            where: {
              loanId,
              status: { in: ["UNPAID", "PARTIAL"] },
              paymentFor: { lte: today },
            },
            select: {
              id: true,
              paymentFor: true,
              emiPayAmount: true,
              amountPaidSoFar: true,
              finePaid: true,
              fineAmount: true,
              delayDays: true,
            },
          });

          const updates = [];
          for (const e of toRefresh) {
            const emiPaidComponent = Math.max(
              Number(e.amountPaidSoFar || 0) - Number(e.finePaid || 0),
              0
            );
            const emiDue = Math.max(
              Number(e.emiPayAmount || 0) - emiPaidComponent,
              0
            );

            const { daysLate, fineAmt } = calculateFine(e.paymentFor, emiDue);
            const newFine = r2(fineAmt);
            const newDelay = Number(daysLate || 0);
            const isDelayed = newDelay > 0;

            if (
              r2(e.fineAmount || 0) !== newFine ||
              Number(e.delayDays || 0) !== newDelay
            ) {
              updates.push(
                tx.eMI.update({
                  where: { id: e.id },
                  data: { fineAmount: newFine, delayDays: newDelay, isDelayed },
                })
              );
            }
          }
          if (updates.length) await Promise.all(updates);
        }

        // (B) fetch unpaid/partial EMIs in order (future fine will be 0)
        const installments = await tx.eMI.findMany({
          where: { loanId, status: { in: ["UNPAID", "PARTIAL"] } },
          orderBy: { paymentFor: "asc" },
          include: {
            loan: { include: { user: true, loanType: true, branch: true } },
          },
        });

        let remaining = r2(amountPaid);
        const updated = [];
        let totalUsed = 0;

        for (const emi of installments) {
          if (remaining <= 0) break;

          // --- EMI outstanding uses only EMI-paid component (excludes finePaid)
          const emiPaidComponent = Math.max(
            Number(emi.amountPaidSoFar || 0) - Number(emi.finePaid || 0),
            0
          );
          const emiDue = Math.max(
            Number(emi.emiPayAmount || 0) - emiPaidComponent,
            0
          );

          // Fine assessment
          const { fineAmt, daysLate } = calculateFine(emi.paymentFor, emiDue);
          const fineAssessed = r2(fineAmt);
          const fineAlreadyPaid = r2(emi.finePaid || 0);
          const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);

          // Nothing due?
          if (emiDue <= 0 && fineDue <= 0) {
            if (
              emi.status !== "PAID" ||
              r2(emi.fineAmount || 0) !== fineAssessed ||
              Number(emi.delayDays || 0) !== Number(daysLate || 0)
            ) {
              await tx.eMI.update({
                where: { id: emi.id },
                data: {
                  status: "PAID",
                  fineAmount: fineAssessed,
                  delayDays: daysLate,
                  isDelayed: daysLate > 0,
                },
              });
            }
            continue;
          }

          // Allocation: fine → interest → principal
          const toPay = Math.min(remaining, r2(emiDue + fineDue));
          if (toPay <= 0) break;

          const payToFine = Math.min(toPay, fineDue);
          const payToEmi = r2(toPay - payToFine);

          const interestOutstanding = Math.max(
            Number(emi.interestAmt || 0) - Number(emi.interestPaid || 0),
            0
          );
          const principalOutstanding = Math.max(
            Number(emi.principalAmt || 0) - Number(emi.principalPaid || 0),
            0
          );
          const payInterest = Math.min(payToEmi, interestOutstanding);
          const payPrincipal = Math.min(
            r2(payToEmi - payInterest),
            principalOutstanding
          );

          const verified =
            paymentMode === "CASH"
              ? req.user.type === "ADMIN" ||
                (await checkVerifyPermission(req.user, "VERIFY_PAYMENT"))
              : true;

          // Create Payment
          const payment = await tx.payment.create({
            data: {
              loanId,
              emiId: emi.id,
              amount: r2(payToFine + payToEmi),
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
              // If you add a JSON column:
              // metadata: { paidToFine: payToFine, paidToInterest: payInterest, paidToPrincipal: payPrincipal }
            },
          });

          // --- UPDATE EMI (amountPaidSoFar = TOTAL paid incl. fine)
          const newFinePaid = r2(fineAlreadyPaid + payToFine);
          const newInterestPaid = r2(
            Number(emi.interestPaid || 0) + payInterest
          );
          const newPrincipalPaid = r2(
            Number(emi.principalPaid || 0) + payPrincipal
          );

          const newAmountPaidSoFar = r2(
            Number(emi.amountPaidSoFar || 0) + payToFine + payToEmi // <- include fine
          );
          const newTotalPaid = r2(
            Number(emi.totalPaid || 0) + payToFine + payToEmi
          );

          // Recompute dues with the same rule
          const emiPaidComponentAfter = Math.max(
            newAmountPaidSoFar - newFinePaid,
            0
          );
          const emiDueAfter = Math.max(
            Number(emi.emiPayAmount || 0) - emiPaidComponentAfter,
            0
          );
          const fineDueAfter = Math.max(fineAssessed - newFinePaid, 0);

          const newStatus =
            emiDueAfter <= 0 && fineDueAfter <= 0 ? "PAID" : "PARTIAL";

          await tx.eMI.update({
            where: { id: emi.id },
            data: {
              amountPaidSoFar: newAmountPaidSoFar, // TOTAL (fine + EMI)
              finePaid: newFinePaid,               // fine bucket
              interestPaid: newInterestPaid,
              principalPaid: newPrincipalPaid,
              totalPaid: newTotalPaid,             // optional aggregate, now equals amountPaidSoFar if you like
              fineAmount: fineAssessed,            // latest assessed fine
              delayDays: daysLate,
              isDelayed: daysLate > 0,
              verified,
              status: verified ? newStatus : "VERIFICATION_PENDING",
              payments: { connect: { id: payment.id } },
            },
          });

          if (verified) {
            await processPostPayment({
              tx,
              emiId: emi.id,
              loanId,
              paymentAmount: r2(payToFine + payToEmi),
              updateEmiStatus: false,
              userContext: {
                adminId: req.user?.adminId,
                employeeId: req.user?.employeeId,
                type: req.user?.type,
                loginActivityId: req.user?.loginActivityId,
              },
            });
          }

          remaining = r2(remaining - (payToFine + payToEmi));
          totalUsed = r2(totalUsed + (payToFine + payToEmi));

          updated.push({
            emiId: emi.id,
            paidAmount: r2(payToFine + payToEmi),
            paidToFine: payToFine,
            paidToEmi: payToEmi,
            paidToInterest: payInterest,
            paidToPrincipal: payPrincipal,
            emiStatus: verified ? newStatus : "VERIFICATION_PENDING",
            daysLate,
            fineAssessed: fineAssessed,
            fineRemaining: r2(fineDueAfter),
            emiRemaining: r2(emiDueAfter),
          });
        }

        return {
          message: "Payment processed",
          usedAmount: totalUsed,
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
        payments: { orderBy: { paymentDate: "desc" }, take: 1 }, // 👈 latest
      },
    });
    if (!inst) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // outstanding principal = EMI - already paid
    const outstandingPrincipal = parseFloat(
      (Number(inst.emiPayAmount) - Number(inst.amountPaidSoFar)).toFixed(2)
    );
    // compute fine based on outstanding principal
    const { daysLate, fineAmt, pct } = calculateFine(
      inst.paymentFor,
      outstandingPrincipal
    );
    // total due = outstanding principal + fine
    const totalDue = parseFloat((outstandingPrincipal + fineAmt).toFixed(2));
    const lastPay = inst.payments?.[0];
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
        paymentMode: lastPay?.paymentMode ?? null,
        transactionId: lastPay?.transactionId ?? null,
        paymentStatus: lastPay?.status ?? null,
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

    const r2 = (n) => Number((Number(n) || 0).toFixed(2));
    amount = r2(Number(amount));
    if (!amount || amount <= 0)
      return res.status(400).json({ error: "amount must be > 0" });
    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const emi = await prisma.eMI.findUnique({ where: { id: emiId } });
    if (!emi) return res.status(404).json({ error: "EMI not found" });

    const emiDue = Math.max(
      Number(emi.emiPayAmount || 0) - Number(emi.amountPaidSoFar || 0),
      0
    );
    const { fineAmt, daysLate } = calculateFine(emi.paymentFor, emiDue);
    const fineAssessed = r2(fineAmt);
    const fineAlreadyPaid = r2(emi.finePaid || 0);
    const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);

    let remaining = Math.min(amount, r2(emiDue + fineDue));
    const payToFine = Math.min(remaining, fineDue);
    remaining = r2(remaining - payToFine);

    const interestOutstanding = Math.max(
      Number(emi.interestAmt || 0) - Number(emi.interestPaid || 0),
      0
    );
    const principalOutstanding = Math.max(
      Number(emi.principalAmt || 0) - Number(emi.principalPaid || 0),
      0
    );

    const payToInterest = Math.min(remaining, interestOutstanding);
    const payToPrincipal = Math.min(
      r2(remaining - payToInterest),
      principalOutstanding
    );

    const canSelfVerify =
      paymentMode !== "CASH"
        ? true
        : req.user?.type === "ADMIN" ||
          (await checkVerifyPermission(req.user, "VERIFY_PAYMENT"));

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          loanId: emi.loanId,
          emiId,
          amount: r2(payToFine + payToInterest + payToPrincipal),
          paymentMode,
          transactionId:
            paymentMode === "ONLINE" || paymentMode === "UPI"
              ? transactionId
              : null,
          paymentDate,
          status: canSelfVerify ? "PAID" : "VERIFICATION_PENDING",
          verified: !!canSelfVerify,
          verifiedAt: canSelfVerify ? new Date() : null,
          ...(req.user?.type === "ADMIN"
            ? { verifiedByAdminId: req.user.id, adminId: req.user.id }
            : {}),
          ...(req.user?.type === "EMPLOYEE"
            ? {
                verifiedByEmployeeId: canSelfVerify ? req.user.id : null,
                employeeId: req.user.id,
              }
            : {}),
          // optional breakdown if you add a JSON column
          // metadata: { paidToFine: payToFine, paidToInterest: payToInterest, paidToPrincipal: payToPrincipal }
        },
      });

      const newFinePaid = r2(fineAlreadyPaid + payToFine);
      const newInterestPaid = r2(Number(emi.interestPaid || 0) + payToInterest);
      const newPrincipalPaid = r2(
        Number(emi.principalPaid || 0) + payToPrincipal
      );
      const newAmountPaidSoFar = r2(
        Number(emi.amountPaidSoFar || 0) + payToInterest + payToPrincipal
      );
      const newTotalPaid = r2(
        Number(emi.totalPaid || 0) + payToFine + payToInterest + payToPrincipal
      );

      const emiDueAfter = Math.max(
        Number(emi.emiPayAmount || 0) - newAmountPaidSoFar,
        0
      );
      const fineDueAfter = Math.max(fineAssessed - newFinePaid, 0);
      const newStatus =
        emiDueAfter <= 0 && fineDueAfter <= 0 ? "PAID" : "PARTIAL";

      await tx.eMI.update({
        where: { id: emiId },
        data: {
          amountPaidSoFar: newAmountPaidSoFar,
          finePaid: newFinePaid,
          interestPaid: newInterestPaid,
          principalPaid: newPrincipalPaid,
          totalPaid: newTotalPaid,
          fineAmount: fineAssessed,
          delayDays: daysLate,
          isDelayed: daysLate > 0,
          status: canSelfVerify ? newStatus : "VERIFICATION_PENDING",
          payments: { connect: { id: payment.id } },
        },
      });

      if (canSelfVerify) {
        await processPostPayment({
          tx,
          emiId,
          loanId: emi.loanId,
          paymentAmount: r2(payToFine + payToInterest + payToPrincipal),
          updateEmiStatus: false,
          userContext: {
            adminId: req.user?.adminId,
            employeeId: req.user?.employeeId,
            type: req.user?.type,
            loginActivityId: req.user?.loginActivityId,
          },
        });
      }

      return {
        message: "Payment applied to installment",
        paymentId: payment.id,
        paid: r2(payToFine + payToInterest + payToPrincipal),
        emiId,
        emiStatus: canSelfVerify ? newStatus : "VERIFICATION_PENDING",
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
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          verified: true,
          status: "PAID", // <-- use the existing 'status' field
          verifiedByAdminId: isAdmin ? req.user.id : null,
          verifiedByEmployeeId: isEmployee ? req.user.id : null,
          verifiedAt: new Date(),
        },
      });

      const postResult = await processPostPayment({
        tx,
        emiId: inst.emiId,
        loanId: inst.loanId,
        paymentAmount: inst.amount,
        updateEmiStatus: true,
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
      ...(userId ? { loan: { is: { userId } } } : {}),
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
// GET /api/loans/:loanId/foreclosure
exports.getForeclosureDetails = async (req, res) => {
  try {
    const { loanId } = req.params;

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { emi: true },
    });
    if (!loan) {
      return res.status(404).json({ status: 404, error: "Loan not found" });
    }

    const today = new Date();
    const rMonthly = (Number(loan.interestRate) || 0) / 100 / 12;

    // Remaining (not fully paid) EMIs
    const remaining = loan.emi
      .filter((e) => e.status !== "PAID")
      .sort((a, b) => new Date(a.paymentFor) - new Date(b.paymentFor));

    // Split into <= today (dueNow) and > today (future)
    const dueNow = [];
    const future = [];

    for (const e of remaining) {
      if (new Date(e.paymentFor) <= today) dueNow.push(e);
      else future.push(e);
    }

    // ---------- Past-due EMIs (<= today): pay outstanding EMI + fine ----------
    let dueNowTotal = 0;
    const dueNowList = dueNow.map((e) => {
      const emiPay = Number(e.emiPayAmount) || 0;
      const paidSoFar = Number(e.amountPaidSoFar) || 0;
      const outstandingEmi = Math.max(emiPay - paidSoFar, 0);

      const { daysLate, fineAmt, pct } = calculateFine(
        e.paymentFor,
        outstandingEmi
      );
      const fine = Number((Number(fineAmt) || 0).toFixed(2));

      const totalDue = Number((outstandingEmi + fine).toFixed(2));
      dueNowTotal += totalDue;

      return {
        emiId: e.id,
        paymentFor: e.paymentFor,
        outstandingEmi: Number(outstandingEmi.toFixed(2)),
        finePercentage: pct,
        fineAmount: fine,
        delayDays: daysLate,
        totalDue,
        // for reference
        scheduledPrincipal: Number(e.principalAmt || 0),
        scheduledInterest: Number(e.interestAmt || 0),
        alreadyPaid: Number(paidSoFar.toFixed?.(2) ?? paidSoFar),
      };
    });

    // ---------- Future EMIs (> today): recompute interest per your formula ----------
    // Principal outstanding going forward = sum of (principalAmt - principalPaid) across FUTURE EMIs
    const principalOutstandingByEmi = future.map((e) => {
      const p = Math.max(
        (Number(e.principalAmt) || 0) - (Number(e.principalPaid) || 0),
        0
      );
      return { emiId: e.id, paymentFor: e.paymentFor, principalDue: p };
    });

    let balance = principalOutstandingByEmi.reduce(
      (s, x) => s + x.principalDue,
      0
    );
    const totalPrincipalFuture = Number(balance.toFixed(2));

    // Build future schedule with interest = balance * rMonthly, then reduce balance by that EMI's principal due
    const futureSchedule = [];
    let futureInterestTotal = 0;

    for (const x of principalOutstandingByEmi) {
      const interestPortion = Number((balance * rMonthly).toFixed(2));
      const principalPortion = Number((x.principalDue || 0).toFixed(2));
      const totalDue = Number((principalPortion + interestPortion).toFixed(2));

      futureInterestTotal += interestPortion;

      futureSchedule.push({
        emiId: x.emiId,
        paymentFor: x.paymentFor,
        principalDue: principalPortion,
        recalculatedInterest: interestPortion,
        totalDue,
      });

      // reduce balance by the scheduled principal of this future EMI
      balance = Math.max(balance - principalPortion, 0);
    }

    // Interest you save by foreclosing now is the future interest that would have been charged
    const interestSavings = Number(futureInterestTotal.toFixed(2));

    // Outstanding total principal (all remaining EMIs, both past and future)
    const totalPrincipalOutstanding = remaining.reduce((sum, e) => {
      const pOutstanding = Math.max(
        (Number(e.principalAmt) || 0) - (Number(e.principalPaid) || 0),
        0
      );
      return sum + pOutstanding;
    }, 0);

    const penaltyPct = Number(loan.penaltyPercentage) || 0;
    const penaltyCharges = Number(
      (totalPrincipalOutstanding * (penaltyPct / 100)).toFixed(2)
    );

    // Foreclosure payable today:
    //  - pay past-due (EMI outstanding + fines)
    //  - pay remaining principal for future EMIs
    //  - pay penalty on total outstanding principal
    // (future interest is not payable if foreclosing now)
    const foreclosureAmount = Number(
      (dueNowTotal + totalPrincipalFuture + penaltyCharges).toFixed(2)
    );

    return res.status(200).json({
      status: 200,
      data: {
        loanId,
        asOfDate: today,
        totals: {
          totalPrincipalOutstanding: Number(
            totalPrincipalOutstanding.toFixed(2)
          ),
          dueNowTotal: Number(dueNowTotal.toFixed(2)),
          futurePrincipalTotal: totalPrincipalFuture,
          futureInterestRecalculatedTotal: interestSavings,
          penaltyCharges,
          interestSavings, // same as futureInterestRecalculatedTotal
          foreclosureAmount,
        },
        dueNow: dueNowList, // past-due EMIs with fine included
        futureSchedule, // future EMIs with recalculated interest
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// --------------------------------
// 💳 POST FORECLOSURE PAYMENT
// --------------------------------
// POST /api/loans/:loanId/foreclosure
exports.postForeclosurePayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    let { amountPaid, paymentMode, transactionId, paymentDate } = req.body;

    amountPaid = Number(amountPaid);
    if (!amountPaid || amountPaid <= 0) {
      return res.status(400).json({ error: "amountPaid must be > 0" });
    }
    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        emi: true,
        twoWheelerLoan: true,
      },
    });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const today = new Date();
    const rMonthly = (Number(loan.interestRate) || 0) / 100 / 12;

    // ----- Split remaining EMIs into past-due and future -----
    const remaining = loan.emi
      .filter((e) => e.status !== "PAID")
      .sort((a, b) => new Date(a.paymentFor) - new Date(b.paymentFor));

    const dueNow = [];
    const future = [];
    for (const e of remaining) {
      (new Date(e.paymentFor) <= today ? dueNow : future).push(e);
    }

    // ----- Past-due EMIs: outstanding EMI + fine -----
    let dueNowTotal = 0;
    let totalFine = 0;
    let principalPaidDueNow = 0;
    let interestPaidDueNow = 0;

    const dueNowBreakdown = dueNow.map((e) => {
      const emiPay = Number(e.emiPayAmount) || 0;
      const paidSoFar = Number(e.amountPaidSoFar) || 0;
      const outstandingEmi = Math.max(emiPay - paidSoFar, 0);

      const { fineAmt, daysLate } = calculateFine(e.paymentFor, outstandingEmi);
      const fine = Number((Number(fineAmt) || 0).toFixed(2));

      const totalDue = Number((outstandingEmi + fine).toFixed(2));
      dueNowTotal += totalDue;
      totalFine += fine;

      // derive remaining principal/interest portions to mark as paid
      const principalOutstanding = Math.max(
        (Number(e.principalAmt) || 0) - (Number(e.principalPaid) || 0),
        0
      );
      const interestOutstanding = Math.max(
        (Number(e.interestAmt) || 0) - (Number(e.interestPaid) || 0),
        0
      );
      principalPaidDueNow += principalOutstanding;
      interestPaidDueNow += interestOutstanding;

      return {
        emiId: e.id,
        outstandingEmi,
        fine,
        daysLate,
        principalOutstanding,
        interestOutstanding,
        totalDue,
      };
    });

    // ----- Future EMIs: pay only outstanding principal (save interest) -----
    const futurePrincipalRows = future.map((e) => ({
      emiId: e.id,
      principalDue: Math.max(
        (Number(e.principalAmt) || 0) - (Number(e.principalPaid) || 0),
        0
      ),
      paymentFor: e.paymentFor,
    }));
    let futurePrincipalTotal = futurePrincipalRows.reduce(
      (s, x) => s + x.principalDue,
      0
    );

    // (Optional) If you want recalculated interest list for UI (not paid), you can compute it:
    // let bal = futurePrincipalTotal;
    // let futureInterestTotal = 0;
    // for (const x of futurePrincipalRows) {
    //   const iPortion = Number((bal * rMonthly).toFixed(2));
    //   futureInterestTotal += iPortion;
    //   bal = Math.max(bal - x.principalDue, 0);
    // }
    // const interestSavings = Number(futureInterestTotal.toFixed(2));

    // Total principal outstanding (both buckets)
    const totalPrincipalOutstanding =
      principalPaidDueNow + futurePrincipalTotal;

    // Penalty on total principal outstanding
    const penaltyCharges = Number(
      (
        totalPrincipalOutstanding *
        ((Number(loan.penaltyPercentage) || 0) / 100)
      ).toFixed(2)
    );

    // Final amount required to foreclose now
    const totalRequired = Number(
      (dueNowTotal + futurePrincipalTotal + penaltyCharges).toFixed(2)
    );

    if (amountPaid < totalRequired) {
      return res.status(400).json({
        error: `Insufficient amount for foreclosure. Required: ${totalRequired}`,
      });
    }

    // ----- Transaction -----
    const txResult = await prisma.$transaction(async (tx) => {
      // Move loan into foreclosure phase first
      await tx.loan.update({
        where: { id: loanId },
        data: { fileStatus: "FORECLOSURE_IN_PROGRESS" },
      });

      // Verified rules
      const canSelfVerify =
        paymentMode !== "CASH"
          ? true
          : req.user?.type === "ADMIN" ||
            (await checkVerifyPermission(req.user, "VERIFY_PAYMENT"));

      let allVerified = true;
      let used = 0;

      // A) Pay past-due EMIs fully + fines
      for (const row of dueNowBreakdown) {
        const payAmt = row.totalDue;
        used += payAmt;

        const payment = await tx.payment.create({
          data: {
            loanId,
            emiId: row.emiId,
            amount: payAmt,
            paymentDate,
            paymentMode,
            transactionId:
              paymentMode === "ONLINE" || paymentMode === "UPI"
                ? transactionId
                : null,
            status: canSelfVerify ? "PAID" : "VERIFICATION_PENDING",
            verified: !!canSelfVerify,
            verifiedAt: canSelfVerify ? new Date() : null,
            verifiedByAdminId: req.user?.type === "ADMIN" ? req.user?.id : null,
            verifiedByEmployeeId:
              req.user?.type === "EMPLOYEE" && canSelfVerify
                ? req.user?.id
                : null,
            adminId: req.user?.type === "ADMIN" ? req.user?.id : undefined,
            employeeId:
              req.user?.type === "EMPLOYEE" ? req.user?.id : undefined,
          },
        });
        if (!payment.verified) allVerified = false;

        await tx.eMI.update({
          where: { id: row.emiId },
          data: {
            amountPaidSoFar: { increment: row.totalDue }, // equals outstandingEmi + fine
            principalPaid: { increment: row.principalOutstanding },
            interestPaid: { increment: row.interestOutstanding },
            finePaid: { increment: row.fine },
            fineAmount: row.fine,
            delayDays: row.daysLate,
            isForeclosure: true,
            status: canSelfVerify ? "PAID" : "VERIFICATION_PENDING",
          },
        });
      }

      // B) Pay future EMIs' principal only (no interest)
      for (const row of futurePrincipalRows) {
        if (row.principalDue <= 0) continue;

        used += row.principalDue;

        const payment = await tx.payment.create({
          data: {
            loanId,
            emiId: row.emiId,
            amount: row.principalDue,
            paymentDate,
            paymentMode,
            transactionId:
              paymentMode === "ONLINE" || paymentMode === "UPI"
                ? transactionId
                : null,
            status: canSelfVerify ? "PAID" : "VERIFICATION_PENDING",
            verified: !!canSelfVerify,
            verifiedAt: canSelfVerify ? new Date() : null,
            verifiedByAdminId: req.user?.type === "ADMIN" ? req.user?.id : null,
            verifiedByEmployeeId:
              req.user?.type === "EMPLOYEE" && canSelfVerify
                ? req.user?.id
                : null,
            adminId: req.user?.type === "ADMIN" ? req.user?.id : undefined,
            employeeId:
              req.user?.type === "EMPLOYEE" ? req.user?.id : undefined,
          },
        });
        if (!payment.verified) allVerified = false;

        await tx.eMI.update({
          where: { id: row.emiId },
          data: {
            amountPaidSoFar: { increment: row.principalDue }, // only principal
            principalPaid: { increment: row.principalDue },
            // interestPaid unchanged (0 extra)
            fineAmount: 0,
            delayDays: 0,
            isForeclosure: true,
            status: canSelfVerify ? "PAID" : "VERIFICATION_PENDING",
          },
        });
      }

      // C) Penalty payment (no emiId)
      if (penaltyCharges > 0) {
        used += penaltyCharges;
        const payment = await tx.payment.create({
          data: {
            loanId,
            amount: penaltyCharges,
            paymentDate,
            paymentMode,
            transactionId:
              paymentMode === "ONLINE" || paymentMode === "UPI"
                ? transactionId
                : null,
            status: canSelfVerify ? "PAID" : "VERIFICATION_PENDING",
            verified: !!canSelfVerify,
            verifiedAt: canSelfVerify ? new Date() : null,
            verifiedByAdminId: req.user?.type === "ADMIN" ? req.user?.id : null,
            verifiedByEmployeeId:
              req.user?.type === "EMPLOYEE" && canSelfVerify
                ? req.user?.id
                : null,
            adminId: req.user?.type === "ADMIN" ? req.user?.id : undefined,
            employeeId:
              req.user?.type === "EMPLOYEE" ? req.user?.id : undefined,
          },
        });
        if (!payment.verified) allVerified = false;
      }

      // D) Update loan totals & status
      await tx.loan.update({
        where: { id: loanId },
        data: {
          totalPaidAmount: { increment: used },
          totalPaidPrincipal: { increment: totalPrincipalOutstanding },
          totalPaidInterest: { increment: interestPaidDueNow }, // interest of due EMIs only
          totalPaidFine: { increment: totalFine }, // not adding penalty here; keep separate if you track it
          pendingAmount: 0, // foreclosure clears balance
          fileStatus: allVerified ? "CLOSED" : "FORECLOSURE_IN_PROGRESS",
          isClosed: allVerified,
          isDefaulted: false,
        },
      });

      // E) If two-wheeler and all verified, attempt hypothecation termination
      let hypothecationResult = null;
      if (allVerified && loan.twoWheelerLoan) {
        try {
          hypothecationResult = await tryAutoTerminateHypothecation({
            tx,
            loanId,
            twoWheelerLoan: loan.twoWheelerLoan,
            userContext: {
              adminId: req.user?.adminId,
              employeeId: req.user?.employeeId,
              type: req.user?.type,
              loginActivityId: req.user?.loginActivityId,
            },
          });
        } catch (e) {
          // swallow into metadata; loan is still closed
          hypothecationResult = {
            ok: false,
            error: e?.message || "termination failed",
          };
        }
      }

      // F) Audit
      await tx.actionLog.create({
        data: {
          action: allVerified
            ? "FORECLOSURE_COMPLETE"
            : "FORECLOSURE_PENDING_VERIFICATION",
          targetId: loanId,
          table: "Loan",
          metadata: {
            used,
            dueNowTotal,
            futurePrincipalTotal,
            penaltyCharges,
            totalFine,
            interestPaidOnOverdues: interestPaidDueNow,
            allVerified,
          },
        },
      });

      return {
        used,
        allVerified,
        hypothecationResult,
      };
    });

    return res.json({
      message: txResult.allVerified
        ? "Loan foreclosed and closed successfully"
        : "Foreclosure recorded; awaiting payment verification",
      data: {
        used: Number(txResult.used.toFixed(2)),
        penaltyCharges,
        totalFine,
        totalPrincipalOutstanding: Number(totalPrincipalOutstanding.toFixed(2)),
        // interestSavings is implicit: you didn't pay future interest
        hypothecationResult: txResult.hypothecationResult,
      },
      status: 200,
    });
  } catch (err) {
    console.error("postForeclosurePayment error:", err);
    return res.status(500).json({ error: err.message });
  }
};
exports.reversePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { emi: true, loan: true },
    });
    if (!payment || payment.status === "REVERSED") {
      return res
        .status(404)
        .json({ error: "Payment not found or already reversed" });
    }

    await prisma.$transaction(async (tx) => {
      // 1) reverse payment row
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "REVERSED", verified: false, verifiedAt: null },
      });

      // 2) roll back EMI amounts (best-effort: assume the entire payment went to amountPaidSoFar)
      if (payment.emiId) {
        const emi = await tx.eMI.update({
          where: { id: payment.emiId },
          data: {
            amountPaidSoFar: { decrement: payment.amount },
            // optional: if you used fine/principal/interest split, decrement those here
          },
        });

        // 3) recompute EMI status (UNPAID / PARTIAL)
        const outstanding = Math.max(
          Number(emi.emiPayAmount || 0) - Number(emi.amountPaidSoFar || 0),
          0
        );
        const newStatus =
          outstanding <= 0
            ? "PAID"
            : emi.amountPaidSoFar > 0
            ? "PARTIAL"
            : "UNPAID";

        if (emi.status !== newStatus) {
          await tx.eMI.update({
            where: { id: emi.id },
            data: { status: newStatus },
          });
        }
      }

      // 4) roll back loan totals
      await tx.loan.update({
        where: { id: payment.loanId },
        data: {
          totalPaidAmount: { decrement: payment.amount },
          pendingAmount: { increment: payment.amount },
        },
      });

      // TODO: optionally re-run a small reconciliation util if you have one
      // to restore totals by summing EMIs and Payments.
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
