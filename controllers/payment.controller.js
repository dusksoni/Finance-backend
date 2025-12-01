// payment.controller.js
const prisma = require("../lib/prisma");
const Decimal = require("decimal.js");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
const {
  shouldCloseLoan,
  tryAutoTerminateHypothecation,
  processPostPayment,
} = require("../utils/loanUtils");
const { calculateFine } = require("../utils/calculateFine");
const {
  shouldUpdateLoanFines,
  markLoanFinesUpdated,
} = require("../utils/fineUpdateCache");

// Configure Decimal.js for precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// --- Utility: calculate fine for any pending principal & dueDate ---
// -----------------------------
// 📋 GET PENDING INSTALLMENTS
// -----------------------------
exports.getPendingPaymentsByLoanId = async (req, res) => {
  try {
    const { loanId } = req.params;
    const today = new Date();

    // Helper for precise rounding using Decimal.js
    const r2 = (n) => new Decimal(n || 0).toDecimalPlaces(2).toNumber();

    // 0) Check cache: only refresh fines if > 1 hour since last update
    if (shouldUpdateLoanFines(loanId)) {
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
          finePaid: true,
          fineAmount: true,
          delayDays: true,
          isDelayed: true,
        },
        orderBy: [{ paymentFor: "asc" }, { id: "asc" }],
      });

      // Batch update using Promise.all for performance
      const updates = toRefresh.map(async (e) => {
        // Outstanding EMI = emiPayAmount - (amountPaidSoFar - finePaid)
        const emiPaidComponent = new Decimal(e.amountPaidSoFar || 0)
          .minus(new Decimal(e.finePaid || 0))
          .toNumber();

        const outstanding = Math.max(
          new Decimal(e.emiPayAmount || 0).minus(emiPaidComponent).toNumber(),
          0
        );

        const { daysLate, fineAmt } = calculateFine(e.paymentFor, outstanding);
        const newFine = r2(fineAmt);
        const newDelay = Number(daysLate || 0);
        const isDelayed = newDelay > 0;

        // Only update if values actually changed
        if (
          r2(e.fineAmount || 0) !== newFine ||
          Number(e.delayDays || 0) !== newDelay ||
          Boolean(e.isDelayed) !== isDelayed
        ) {
          return prisma.eMI.update({
            where: { id: e.id },
            data: { fineAmount: newFine, delayDays: newDelay, isDelayed },
          });
        }
        return null;
      });

      // Execute all updates in parallel
      await Promise.all(updates);

      // Mark this loan as updated in cache
      markLoanFinesUpdated(loanId);
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

    // 2) compute response fields with Decimal.js for precision
    let grandTotal = new Decimal(0);
    const pending = installments.map((inst) => {
      const emiPaidComponent = new Decimal(inst.amountPaidSoFar || 0)
        .minus(new Decimal(inst.finePaid || 0))
        .toNumber();

      const outstanding = Math.max(
        new Decimal(inst.emiPayAmount || 0).minus(emiPaidComponent).toNumber(),
        0
      );

      const fineAlreadyPaid = Number(inst.finePaid || 0);
      const { daysLate, fineAmt, pct } = calculateFine(
        inst.paymentFor,
        outstanding
      );
      const fineAssessed = r2(fineAmt);
      const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);

      const totalDue = r2(outstanding + fineDue);
      grandTotal = grandTotal.plus(totalDue); // 👈 accumulate with Decimal.js!

      return {
        emiId: inst.id,
        paymentFor: inst.paymentFor,
        emiPayAmount: Number(inst.emiPayAmount),
        alreadyPaid: Number(inst.amountPaidSoFar), // this is total (emi + fine)
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
      data: { loanId, pending, grandTotal: grandTotal.toDecimalPlaces(2).toNumber() },
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
    let { amountPaid, paymentMode, transactionId, paymentDate, useGateway } = req.body;

    // Helper for precise rounding using Decimal.js
    const r2 = (n) => new Decimal(n || 0).toDecimalPlaces(2).toNumber();

    amountPaid = r2(Number(amountPaid));
    if (!amountPaid || amountPaid <= 0) {
      return res
        .status(400)
        .json({ error: "amountPaid must be more than 0", status: 400 });
    }

    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const result = await prisma.$transaction(
      async (tx) => {
        // (A) Check cache and refresh fines if needed
        const today = new Date();

        // Use cache check (1-hour smart caching)
        if (shouldUpdateLoanFines(loanId)) {
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

          // Batch updates with Promise.all for performance
          const updates = toRefresh.map(async (e) => {
            const emiPaidComponent = new Decimal(e.amountPaidSoFar || 0)
              .minus(new Decimal(e.finePaid || 0))
              .toNumber();

            const emiDue = Math.max(
              new Decimal(e.emiPayAmount || 0).minus(emiPaidComponent).toNumber(),
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
              return tx.eMI.update({
                where: { id: e.id },
                data: { fineAmount: newFine, delayDays: newDelay, isDelayed },
              });
            }
            return null;
          });

          await Promise.all(updates);
          markLoanFinesUpdated(loanId);
        }

        // (B) fetch unpaid/partial EMIs in order
        const installments = await tx.eMI.findMany({
          where: { loanId, status: { in: ["UNPAID", "PARTIAL"] } },
          orderBy: { paymentFor: "asc" },
          include: {
            loan: { include: { user: true, loanType: true, branch: true } },
          },
        });

        // Check verification permission once
        // Gateway payments are auto-approved, manual payments require permission
        const verified = useGateway
          ? true // Auto-approve gateway payments
          : paymentMode === "CASH"
          ? req.user.type === "ADMIN" ||
            checkVerifyPermission(req.user, "PAYMENT_VERIFY")
          : true;

        // CREATE ONE PAYMENT RECORD FOR THE ENTIRE AMOUNT
        const payment = await tx.payment.create({
          data: {
            loanId,
            emiId: null, // Not tied to specific EMI - affects multiple EMIs
            amount: amountPaid, // Full 10k amount
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
            metadata: {
              note: "Payment distributed across multiple EMIs",
              affectedEmis: [], // Will be populated below
            },
          },
        });

        let remaining = r2(amountPaid);
        const updated = [];
        let totalUsed = 0;
        let totalFineCollected = 0;
        let totalInterestCollected = 0;
        let totalPrincipalCollected = 0;

        // Now distribute the payment across EMIs
        for (const emi of installments) {
          if (remaining <= 0) break;

          // outstanding EMI uses only EMI-paid component (excludes finePaid)
          const emiPaidComponent = Math.max(
            Number(emi.amountPaidSoFar || 0) - Number(emi.finePaid || 0),
            0
          );
          const emiDue = Math.max(
            Number(emi.emiPayAmount || 0) - emiPaidComponent,
            0
          );

          // fine assessment
          const { fineAmt, daysLate } = calculateFine(emi.paymentFor, emiDue);
          const fineAssessed = r2(fineAmt);
          const fineAlreadyPaid = r2(emi.finePaid || 0);
          const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);

          // nothing due
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

          // allocate: fine → interest → principal
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
          const payInterest = r2(Math.min(payToEmi, interestOutstanding));
          const payPrincipal = r2(Math.min(
            r2(payToEmi - payInterest),
            principalOutstanding
          ));

          // Update EMI (amountPaidSoFar = fine + EMI)
          const newFinePaid = r2(fineAlreadyPaid + payToFine);
          const newInterestPaid = r2(
            Number(emi.interestPaid || 0) + payInterest
          );
          const newPrincipalPaid = r2(
            Number(emi.principalPaid || 0) + payPrincipal
          );

          const newAmountPaidSoFar = r2(
            Number(emi.amountPaidSoFar || 0) + payToFine + payToEmi
          );
          const newTotalPaid = r2(
            Number(emi.totalPaid || 0) + payToFine + payToEmi
          );

          // Recompute dues with proper rounding to avoid precision errors
          const emiPaidComponentAfter = r2(
            newAmountPaidSoFar - newFinePaid
          );
          const emiDueAfter = r2(Math.max(
            Number(emi.emiPayAmount || 0) - emiPaidComponentAfter,
            0
          ));
          const fineDueAfter = r2(Math.max(fineAssessed - newFinePaid, 0));

          // Log for debugging
          console.log(`📊 EMI ${emi.id} Status Check:`, {
            emiPayAmount: Number(emi.emiPayAmount),
            emiPaidComponentAfter,
            emiDueAfter,
            fineDueAfter,
            payToFine,
            payToEmi,
            newAmountPaidSoFar,
            newFinePaid
          });

          // Consider amounts <= 0.01 as fully paid (to handle rounding)
          const newStatus =
            emiDueAfter <= 0.01 && fineDueAfter <= 0.01 ? "PAID" : "PARTIAL";

          // Update EMI and link to the single payment record
          await tx.eMI.update({
            where: { id: emi.id },
            data: {
              amountPaidSoFar: newAmountPaidSoFar, // TOTAL (fine + EMI)
              finePaid: newFinePaid,
              interestPaid: newInterestPaid,
              principalPaid: newPrincipalPaid,
              totalPaid: newTotalPaid,
              fineAmount: fineAssessed,
              delayDays: daysLate,
              isDelayed: daysLate > 0,
              verified,
              status: verified ? newStatus : "VERIFICATION_PENDING",
              payments: { connect: { id: payment.id } }, // Link to the single payment
            },
          });

          // ✅ Update loan *totals* for the fine portion (do NOT touch pendingAmount here)
          if (verified && payToFine > 0) {
            await tx.loan.update({
              where: { id: loanId },
              data: {
                totalPaidFine: { increment: r2(payToFine) },
                // keep totalPaidAmount reflecting all money received:
                totalPaidAmount: { increment: r2(payToFine) },
              },
            });
          }

          // Reduce pendingAmount only by EMI (interest + principal)
          if (verified && payToEmi > 0) {
            await processPostPayment({
              tx,
              emiId: emi.id,
              loanId,
              paymentAmount: r2(payToEmi), // EMI only
              addToEmi: false,
              updateEmiStatus: false,
              userContext: {
                adminId: req.user?.adminId,
                employeeId: req.user?.employeeId,
                type: req.user?.type,
                loginActivityId: req.user?.loginActivityId,
              },
            });
          }

          // Track totals for payment metadata
          remaining = r2(remaining - (payToFine + payToEmi));
          totalUsed = r2(totalUsed + (payToFine + payToEmi));
          totalFineCollected = r2(totalFineCollected + payToFine);
          totalInterestCollected = r2(totalInterestCollected + payInterest);
          totalPrincipalCollected = r2(totalPrincipalCollected + payPrincipal);

          updated.push({
            emiId: emi.id,
            paymentFor: emi.paymentFor,
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

        // Update payment metadata with distribution details
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            metadata: {
              note: "Payment distributed across multiple EMIs",
              affectedEmis: updated,
              summary: {
                totalAmount: amountPaid,
                usedAmount: totalUsed,
                unallocatedAmount: remaining,
                fineCollected: totalFineCollected,
                interestCollected: totalInterestCollected,
                principalCollected: totalPrincipalCollected,
                emisAffected: updated.length,
              },
            },
          },
        });

        return {
          message: "Payment processed",
          paymentId: payment.id,
          usedAmount: totalUsed,
          unallocatedAmount: remaining,
          summary: {
            fineCollected: totalFineCollected,
            interestCollected: totalInterestCollected,
            principalCollected: totalPrincipalCollected,
          },
          updatedInstallments: updated,
        };
      },
      { timeout: 30000 } // Increased to 30s for complex payment processing
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
        payment: inst.payments,
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
    let { amount, paymentMode, transactionId, paymentDate, useGateway } = req.body;

    const r2 = (n) => Number((Number(n) || 0).toFixed(2));
    amount = r2(Number(amount));
    if (!amount || amount <= 0)
      return res.status(400).json({ error: "amount must be > 0" });

    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const emi = await prisma.eMI.findUnique({ where: { id: emiId } });
    if (!emi) return res.status(404).json({ error: "EMI not found" });

    // EMI due should ignore previously paid fine portion:
    const emiPaidComponent = Math.max(
      Number(emi.amountPaidSoFar || 0) - Number(emi.finePaid || 0),
      0
    );
    const emiDue = Math.max(
      Number(emi.emiPayAmount || 0) - emiPaidComponent,
      0
    );

    // Fine assessment on EMI due
    const { fineAmt, daysLate } = calculateFine(emi.paymentFor, emiDue);
    const fineAssessed = r2(fineAmt);
    const fineAlreadyPaid = r2(emi.finePaid || 0);
    const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);

    // Allocate: fine → interest → principal
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

    // Gateway payments are auto-approved, manual payments require permission
    const canSelfVerify = useGateway
      ? true
      : (await checkVerifyPermission(req.user, "PAYMENT_VERIFY"));

    // --- Keep the transaction TINY; post-processing happens AFTER commit ---
    const txResult = await prisma.$transaction(
      async (tx) => {
        // 1) Create payment
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
          },
        });

        // 2) Update EMI (amountPaidSoFar = fine + interest + principal)
        const newFinePaid = r2(fineAlreadyPaid + payToFine);
        const newInterestPaid = r2(
          Number(emi.interestPaid || 0) + payToInterest
        );
        const newPrincipalPaid = r2(
          Number(emi.principalPaid || 0) + payToPrincipal
        );
        const newAmountPaidSoFar = r2(
          Number(emi.amountPaidSoFar || 0) +
            payToFine +
            payToInterest +
            payToPrincipal
        );
        const newTotalPaid = r2(
          Number(emi.totalPaid || 0) +
            payToFine +
            payToInterest +
            payToPrincipal
        );

        // Recompute status with same rule (EMI component vs fine)
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
          where: { id: emiId },
          data: {
            amountPaidSoFar: newAmountPaidSoFar, // TOTAL
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

        // 3) Loan: record fine collections but DO NOT reduce pending by fine
        if (canSelfVerify && payToFine > 0) {
          await tx.loan.update({
            where: { id: emi.loanId },
            data: {
              totalPaidFine: { increment: r2(payToFine) },
              totalPaidAmount: { increment: r2(payToFine) }, // tracked as collected
            },
          });
        }

        // Return what we need for post-commit work
        return {
          paymentId: payment.id,
          newStatus: canSelfVerify ? newStatus : "VERIFICATION_PENDING",
          doPostHook: canSelfVerify && payToInterest + payToPrincipal > 0,
          emiPortion: r2(payToInterest + payToPrincipal),
          loanId: emi.loanId,
        };
      },
      { timeout: 20000 } // ⬅️ Increase interactive tx timeout (default ~5s)
    );

    // --- Post-commit: reduce pendingAmount etc. with EMI portion only ---
    if (txResult.doPostHook) {
      try {
        await processPostPayment({
          tx: prisma, // use plain client OUTSIDE the transaction
          emiId,
          loanId: txResult.loanId,
          paymentAmount: txResult.emiPortion, // EMI portion only (no fine)
          addToEmi: false,
          updateEmiStatus: false,
          userContext: {
            adminId: req.user?.adminId,
            employeeId: req.user?.employeeId,
            type: req.user?.type,
            loginActivityId: req.user?.loginActivityId,
          },
        });
      } catch (e) {
        // Don’t fail the main request if the post hook is slow; log & let a job re-run reconciliation if needed
        console.warn("processPostPayment post-commit failed:", e?.message);
      }
    }

    return res.status(200).json({
      data: {
        message: canSelfVerify ? "Payment Success" : "Payment Success waiting for approval",
        paymentId: txResult.paymentId,
        paid: r2(payToFine + payToInterest + payToPrincipal),
        paidToFine: r2(payToFine),
        paidToInterest: r2(payToInterest),
        paidToPrincipal: r2(payToPrincipal),
        emiId,
        emiStatus: txResult.newStatus,
      },
      status: 200,
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

    // Load the target payment with its loan & emi (basic)
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

    // Permission check
    const isAdmin = req.user.type === "ADMIN";
    const verified = (await checkVerifyPermission(req.user, "PAYMENT_VERIFY"));
    if (!verified) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const r2 = (n) => Number((Number(n) || 0).toFixed(2));

    const result = await prisma.$transaction(async (tx) => {
      // 1) Mark payment verified
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          verified: true,
          status: "PAID",
          verifiedByAdminId: isAdmin ? req.user.id : null,
          verifiedByEmployeeId: !isAdmin ? req.user.id : null,
          verifiedAt: new Date(),
        },
      });

      // 2) Deterministically recompute this payment's breakdown (fine / interest / principal)
      //    by replaying all payments for this EMI in chronological order.
      const emiRow = await tx.eMI.findUnique({
        where: { id: inst.emiId },
        select: {
          id: true,
          loanId: true,
          paymentFor: true,
          emiPayAmount: true,
          principalAmt: true,
          interestAmt: true,
        },
      });

      const allEmiPayments = await tx.payment.findMany({
        where: { emiId: inst.emiId },
        orderBy: [
          { paymentDate: "asc" },
          // Payment model lacks createdAt; use id as deterministic tiebreaker
          { id: "asc" },
        ],
        select: { id: true, amount: true },
      });

      let finePaidSoFar = 0;
      let interestPaidSoFar = 0;
      let principalPaidSoFar = 0;

      let thisPaidToFine = 0;
      let thisPaidToInterest = 0;
      let thisPaidToPrincipal = 0;

      for (const p of allEmiPayments) {
        // EMI due uses ONLY EMI component (interest+principal) previously paid
        const emiComponentPaid = r2(interestPaidSoFar + principalPaidSoFar);
        const emiDueNow = Math.max(
          Number(emiRow.emiPayAmount || 0) - emiComponentPaid,
          0
        );

        const { fineAmt } = calculateFine(emiRow.paymentFor, emiDueNow);
        const fineAssessedNow = r2(fineAmt);
        const fineDueNow = Math.max(fineAssessedNow - finePaidSoFar, 0);

        let rem = r2(p.amount);

        const payFine = Math.min(rem, fineDueNow);
        rem = r2(rem - payFine);

        const interestOutstanding = Math.max(
          Number(emiRow.interestAmt || 0) - interestPaidSoFar,
          0
        );
        const payInterest = Math.min(rem, interestOutstanding);
        rem = r2(rem - payInterest);

        const principalOutstanding = Math.max(
          Number(emiRow.principalAmt || 0) - principalPaidSoFar,
          0
        );
        const payPrincipal = Math.min(rem, principalOutstanding);

        // Track if this is the payment being verified now
        if (p.id === paymentId) {
          thisPaidToFine = r2(payFine);
          thisPaidToInterest = r2(payInterest);
          thisPaidToPrincipal = r2(payPrincipal);
        }

        // Move accumulators forward
        finePaidSoFar = r2(finePaidSoFar + payFine);
        interestPaidSoFar = r2(interestPaidSoFar + payInterest);
        principalPaidSoFar = r2(principalPaidSoFar + payPrincipal);
      }

      const emiPortion = r2(thisPaidToInterest + thisPaidToPrincipal);
      const finePortion = r2(thisPaidToFine);

      // 3) Update loan money totals for FINE (does not reduce pendingAmount)
      if (finePortion > 0) {
        await tx.loan.update({
          where: { id: inst.loanId },
          data: {
            totalPaidFine: { increment: finePortion },
            totalPaidAmount: { increment: finePortion }, // you collect it, so reflect in totalPaidAmount
          },
        });
      }

      // 4) Reduce pendingAmount only by EMI portion via your existing hook
      const postResult = await processPostPayment({
        tx,
        emiId: inst.emiId,
        loanId: inst.loanId,
        paymentAmount: emiPortion, // ⬅️ interest + principal ONLY
        addToEmi: false,
        updateEmiStatus: true, // let the util finalize EMI status if thresholds met
        userContext: {
          adminId: req.user?.adminId,
          employeeId: req.user?.employeeId,
          type: req.user?.type,
          loginActivityId: req.user?.loginActivityId,
        },
      });

      return {
        updated,
        breakdown: {
          finePortion,
          interestPortion: thisPaidToInterest,
          principalPortion: thisPaidToPrincipal,
          emiPortion,
        },
        ...postResult,
      };
    }, { maxWait: 2000, timeout: 30000 });

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
      // verified: false,
      ...(loanId ? { loanId } : {}),
      ...(userId ? { loan: { is: { userId } } } : {}),
      ...(status ? { status: status } : {}),
    };

    console.log(where);

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
        admin: true,
        employee: true,
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

// 📉 FORECLOSURE CALCULATIONS (no penalty)
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

    const r2 = (n) => Number((Number(n) || 0).toFixed(2));
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
      (new Date(e.paymentFor) <= today ? dueNow : future).push(e);
    }

    // ---------- Past-due EMIs (<= today): pay EMI outstanding + fine due ----------
    let totalforeclosureAmount = 0;
    let dueNowTotal = 0;
    let overdueInterestOutstanding = 0;
    let overdueFineDueTotal = 0;

    const dueNowList = dueNow.map((e) => {
      const emiPay = Number(e.emiPayAmount) || 0;

      // amountPaidSoFar now includes fine; extract EMI-paid component
      const finePaid = Number(e.finePaid || 0);
      const emiPaidComponent = Math.max(
        (Number(e.amountPaidSoFar) || 0) - finePaid,
        0
      );

      // EMI due now (principal+interest only)
      const emiDueOnly = Math.max(emiPay - emiPaidComponent, 0);

      // Outstanding splits (for info & sums)
      const principalOutstanding = Math.max(
        (Number(e.principalAmt) || 0) - (Number(e.principalPaid) || 0),
        0
      );
      const interestOutstanding = Math.max(
        (Number(e.interestAmt) || 0) - (Number(e.interestPaid) || 0),
        0
      );

      // Fine due = assessed - already paid
      const { daysLate, fineAmt, pct } = calculateFine(
        e.paymentFor,
        emiDueOnly
      );
      const fineAssessed = r2(fineAmt);
      const fineDue = Math.max(fineAssessed - finePaid, 0);

      const totalDue = r2(emiDueOnly + fineDue);
      totalforeclosureAmount += totalDue;
      // accumulate totals for “due now” bucket
      dueNowTotal += totalDue;
      overdueInterestOutstanding += interestOutstanding;
      overdueFineDueTotal += fineDue;

      return {
        emiId: e.id,
        paymentFor: e.paymentFor,
        emiDueOnly: r2(emiDueOnly), // EMI (principal+interest) still due
        fineAssessed: fineAssessed,
        finePaid: r2(finePaid),
        fineDue: r2(fineDue),
        delayDays: daysLate,
        finePercentage: pct,
        totalDue, // emiDueOnly + fineDue
        // reference fields
        scheduledPrincipal: Number(e.principalAmt || 0),
        scheduledInterest: Number(e.interestAmt || 0),
        principalOutstanding: r2(principalOutstanding),
        interestOutstanding: r2(interestOutstanding),
        alreadyPaidTotal: r2(e.amountPaidSoFar || 0),
      };
    });

    // ---------- Future EMIs (> today): principal will be collected, interest is saved ----------
    // For schedule/insight (not used in the total):
    const principalOutstandingByEmi = future.map((e) => {
      const p = Math.max(
        (Number(e.principalAmt) || 0) - (Number(e.principalPaid) || 0),
        0
      );
      return {
        emiId: e.id,
        paymentFor: e.paymentFor,
        interestAmt: e.interestAmt,
        principalOutstanding: r2(p),
      };
    });

    // interest “would-have-been-charged” schedule (for info only)
    let balance = principalOutstandingByEmi.reduce(
      (s, x) => s + x.principalOutstanding,
      0
    );
    let futureInterestTotal = 0;
    const futureSchedule = principalOutstandingByEmi.map((row) => {
      const interestPortion = r2(balance * rMonthly);
      const principalPortion = r2(row.principalOutstanding);
      const totalHypothetical = r2(interestPortion + principalPortion);
      futureInterestTotal = r2(
        futureInterestTotal + (row.interestAmt - interestPortion)
      );
      balance = Math.max(balance - principalPortion, 0);
      totalforeclosureAmount += totalHypothetical;
      return {
        emiId: row.emiId,
        paymentFor: row.paymentFor,
        principalOutstanding: principalPortion,
        recalculatedInterest: interestPortion, // hypothetical / saved if foreclosing now
        totalHypothetical,
      };
    });
    const interestSavings = r2(futureInterestTotal);

    // ---------- Base principal across all remaining EMIs (overdue + future) ----------
    const totalPrincipalOutstanding = r2(
      remaining.reduce((sum, e) => {
        const pOutstanding = Math.max(
          (Number(e.principalAmt) || 0) - (Number(e.principalPaid) || 0),
          0
        );
        return sum + pOutstanding;
      }, 0)
    );

    // ---------- Final foreclosure amount (NO penalty) ----------
    const totals = {
      totalPrincipalOutstanding, // base principal across all remaining EMIs
      overdueInterestOutstanding: r2(overdueInterestOutstanding),
      overdueFineDueTotal: r2(overdueFineDueTotal),
      dueNowTotal: r2(dueNowTotal), // (emiDueOnly + fineDue) for overdue bucket
      interestSavings, // from future EMIs (informational)
      foreclosureAmount: r2(totalforeclosureAmount),
    };

    return res.status(200).json({
      status: 200,
      data: {
        loanId,
        asOfDate: today,
        totals,
        dueNow: dueNowList,
        futureSchedule, // informational only; not used in totals
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
// --------------------------------
// 💳 POST FORECLOSURE PAYMENT (single receipt; mirrors GET foreclosure math)
// --------------------------------
exports.postForeclosurePayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    let { amountPaid, paymentMode, transactionId, paymentDate } = req.body;

    const r2 = (n) => Number((Number(n) || 0).toFixed(2));
    amountPaid = r2(Number(amountPaid));
    if (!amountPaid || amountPaid <= 0) {
      return res.status(400).json({ error: "amountPaid must be > 0" });
    }
    if (paymentMode !== "CASH" && !transactionId) {
      return res
        .status(400)
        .json({ error: "transactionId required for non-cash payment" });
    }
    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { emi: true, twoWheelerLoan: true },
    });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const today = new Date();
    const rMonthly = (Number(loan.interestRate) || 0) / 100 / 12;

    // Remaining EMIs sorted by due date
    const remaining = loan.emi
      .filter((e) => e.status !== "PAID")
      .sort((a, b) => new Date(a.paymentFor) - new Date(b.paymentFor));

    // Split into overdue (<= today) and future (> today)
    const dueNow = [];
    const future = [];
    for (const e of remaining) {
      (new Date(e.paymentFor) <= today ? dueNow : future).push(e);
    }

    // ---------- Past-due EMIs (<= today): EMI due (P+I) + fine DUE ----------
    let dueNowTotal = 0;
    let overdueInterestOutstanding = 0; // interest we will collect now
    let overdueFineDueTotal = 0;
    let principalFromOverdues = 0;

    const dueNowBreakdown = dueNow.map((e) => {
      const emiPay = Number(e.emiPayAmount) || 0;

      // amountPaidSoFar includes fine; extract EMI-paid component (P+I)
      const finePaidAlready = Number(e.finePaid || 0);
      const emiPaidComponent = Math.max(
        (Number(e.amountPaidSoFar) || 0) - finePaidAlready,
        0
      );

      // EMI (P+I) still due
      const emiDueOnly = Math.max(emiPay - emiPaidComponent, 0);

      // Fine based on outstanding EMI (same approach as GET)
      const { daysLate, fineAmt, pct } = calculateFine(
        e.paymentFor,
        emiDueOnly
      );
      const fineAssessed = r2(fineAmt);
      const fineDue = r2(Math.max(fineAssessed - finePaidAlready, 0));

      // Outstanding splits to credit buckets NOW
      const principalOutstanding = Math.max(
        (Number(e.principalAmt) || 0) - (Number(e.principalPaid) || 0),
        0
      );
      const interestOutstanding = Math.max(
        (Number(e.interestAmt) || 0) - (Number(e.interestPaid) || 0),
        0
      );

      const totalDue = r2(emiDueOnly + fineDue);

      dueNowTotal = r2(dueNowTotal + totalDue);
      overdueInterestOutstanding = r2(
        overdueInterestOutstanding + interestOutstanding
      );
      overdueFineDueTotal = r2(overdueFineDueTotal + fineDue);
      principalFromOverdues = r2(principalFromOverdues + principalOutstanding);

      return {
        emiId: e.id,
        paymentFor: e.paymentFor,
        emiDueOnly: r2(emiDueOnly), // P+I still due for this EMI
        fineAssessed: r2(fineAssessed),
        finePaidAlready: r2(finePaidAlready),
        fineDue: r2(fineDue),
        daysLate,
        finePercentage: pct,
        // amounts that will be COLLECTED NOW
        principalCollectedNow: r2(principalOutstanding),
        interestCollectedNow: r2(interestOutstanding),
        totalDue, // emiDueOnly + fineDue
      };
    });

    // ---------- Future EMIs (> today): principal + recalculated interest ----------
    // Build principal rows first (like GET's principalOutstandingByEmi)
    const futureRows = future.map((e) => {
      const principalOutstanding = Math.max(
        (Number(e.principalAmt) || 0) - (Number(e.principalPaid) || 0),
        0
      );
      return {
        emiId: e.id,
        paymentFor: e.paymentFor,
        scheduledInterest: Number(e.interestAmt) || 0,
        principalOutstanding: r2(principalOutstanding),
      };
    });

    // rolling balance = sum of principalOutstanding across FUTURE EMIs
    let rollingBalance = r2(
      futureRows.reduce((s, x) => s + x.principalOutstanding, 0)
    );

    let futureRecalcInterestTotal = 0; // interest we WILL collect now for futures
    let futureInterestSavingsTotal = 0; // scheduled - recalculated (for info)
    let futureTotalHypothetical = 0; // principal + recalculated interest (sum)

    const futureSchedule = futureRows.map((row) => {
      const recalculatedInterest = r2(rollingBalance * rMonthly); // same as GET
      const principalPortion = r2(row.principalOutstanding);
      const totalHypothetical = r2(recalculatedInterest + principalPortion);

      futureRecalcInterestTotal = r2(
        futureRecalcInterestTotal + recalculatedInterest
      );
      futureInterestSavingsTotal = r2(
        futureInterestSavingsTotal +
          (row.scheduledInterest - recalculatedInterest)
      );
      futureTotalHypothetical = r2(futureTotalHypothetical + totalHypothetical);

      const out = {
        emiId: row.emiId,
        paymentFor: row.paymentFor,
        openingBalance: r2(rollingBalance),
        principalCollectedNow: principalPortion, // collected now
        interestCollectedNow: recalculatedInterest, // collected now (recalc)
        totalHypothetical, // what we're collecting for each future EMI
      };

      rollingBalance = r2(Math.max(rollingBalance - principalPortion, 0));
      return out;
    });

    const futurePrincipalTotal = r2(
      futureRows.reduce((s, x) => s + x.principalOutstanding, 0)
    );

    // ---------- Totals (mirror GET) ----------
    const totalPrincipalOutstanding = r2(
      principalFromOverdues + futurePrincipalTotal
    );

    const foreclosureAmount = r2(
      dueNowTotal + futureTotalHypothetical // overdues (emiDue+fine) + futures (P + recalculated I)
    );

    // Enforce exact amount to avoid book-keeping drift
    if (Math.abs(amountPaid - foreclosureAmount) > 0.01) {
      return res.status(400).json({
        error: `Amount must equal foreclosure requirement. Required: ${foreclosureAmount}`,
      });
    }

    const permissions = await checkVerifyPermission(
      req.user,
      "FORECLOSE_CREATE"
    );

    if (!permissions) {
      return res.status(403).json({ error: "Access denied", status: 403 });
    }

    // ---- TX: ONE Payment row + bulk EMI updates + loan aggregates (re-synced)
    const result = await prisma.$transaction(
      async (tx) => {
        // mark in-progress
        await tx.loan.update({
          where: { id: loanId },
          data: { fileStatus: "FORECLOSURE_IN_PROGRESS" },
        });

        // Covered EMIs list
        const coveredEmiIds = [
          ...dueNowBreakdown.map((r) => r.emiId),
          ...futureSchedule.map((r) => r.emiId),
        ];

        // A) Create ONE payment record for the whole foreclosure
        const payment = await tx.payment.create({
          data: {
            loanId,
            emiId: null,
            amount: foreclosureAmount,
            paymentDate,
            paymentMode,
            transactionId: paymentMode === "CASH" ? null : transactionId,
            status: "PAID",
            verified: true,
            verifiedAt: new Date(),
            isForeclosure: true,
            metadata: {
              type: "FORECLOSURE",
              asOfDate: new Date(),
              rateMonthly: rMonthly,
              counts: {
                overdueCount: dueNowBreakdown.length,
                futureCount: futureSchedule.length,
              },
              // Overdue EMIs collected now
              dueNowBreakdown,
              // Future EMIs collected now (principal + recalculated interest)
              futureSchedule,
              coveredEmiIds,
              // Totals for UI summaries
              totals: {
                principalCollectedNow: totalPrincipalOutstanding, // overdues + future principal
                interestCollectedNow: r2(
                  overdueInterestOutstanding + futureRecalcInterestTotal
                ),
                interestSaved: r2(futureInterestSavingsTotal), // informational (scheduled - recalculated)
                fineCollectedNow: r2(overdueFineDueTotal),
                amountAppliedNow: foreclosureAmount, // = dueNowTotal + futureTotalHypothetical
              },
            },
            ...(req.user?.type === "ADMIN"
              ? {
                  verifiedByAdminId: req.user?.id,
                  adminId: req.user?.id,
                }
              : {}),
            ...(req.user?.type === "EMPLOYEE"
              ? {
                  verifiedByEmployeeId: req.user?.id,
                  employeeId: req.user?.id,
                }
              : {}),
          },
        });

        // B) Update OVERDUE EMIs with precise increments
        for (const row of dueNowBreakdown) {
          await tx.eMI.update({
            where: { id: row.emiId },
            data: {
              amountPaidSoFar: { increment: row.totalDue }, // P+I + fineDue
              principalPaid: { increment: row.principalCollectedNow },
              interestPaid: { increment: row.interestCollectedNow },
              finePaid: { increment: row.fineDue },
              fineAmount: row.fineAssessed,
              delayDays: row.daysLate,
              isForeclosure: true,
              status: "PAID",
            },
          });
        }

        // C) Update FUTURE EMIs (principal + recalculated interest)
        for (const row of futureSchedule) {
          const principalInc = r2(row.principalCollectedNow || 0);
          const interestInc = r2(row.interestCollectedNow || 0);
          const totalInc = r2(principalInc + interestInc);

          if (totalInc <= 0) continue;

          await tx.eMI.update({
            where: { id: row.emiId },
            data: {
              amountPaidSoFar: { increment: totalInc },
              principalPaid: { increment: principalInc },
              interestPaid: { increment: interestInc },
              fineAmount: 0,
              delayDays: 0,
              isForeclosure: true,
              status: "PAID",
            },
          });
        }

        // D) FINALIZE: when verified, re-sync aggregates from DB (carry prior + current)
        // 1) Sum from EMI buckets
        const emiAgg = await tx.eMI.aggregate({
          where: { loanId },
          _sum: { principalPaid: true, interestPaid: true, finePaid: true },
        });

        const sumPrincipal = r2(Number(emiAgg._sum.principalPaid || 0));
        const sumInterest = r2(Number(emiAgg._sum.interestPaid || 0));
        const sumFine = r2(Number(emiAgg._sum.finePaid || 0));

        // 2) Sum of PAID receipts (single foreclosure + earlier)
        const payAgg = await tx.payment.aggregate({
          where: { loanId, status: "PAID" },
          _sum: { amount: true },
        });
        const sumPaid = r2(Number(payAgg._sum.amount || 0));

        await tx.loan.update({
          where: { id: loanId },
          data: {
            totalPaidPrincipal: sumPrincipal,
            totalPaidInterest: sumInterest,
            totalPaidFine: sumFine,
            totalPaidAmount: sumPaid,

            pendingAmount: 0,
            fileStatus: "CLOSED",
            isClosed: true,
            isDefaulted: false,

            isForeclosed: true,
            foreclosedAt: paymentDate,
          },
        });

        // Optional: auto-terminate hypothecation
        if (loan.twoWheelerLoan) {
          try {
            await tryAutoTerminateHypothecation({
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
          } catch (_) {}
        }

        // E) Audit
        await tx.actionLog.create({
          data: {
            action: "FORECLOSURE_COMPLETE",
            targetId: loanId,
            table: "Loan",
            metadata: {
              paymentId: payment.id,
              coveredEmiIds,
              totals: {
                principalCollectedNow: totalPrincipalOutstanding,
                interestCollectedNow: r2(
                  overdueInterestOutstanding + futureRecalcInterestTotal
                ),
                interestSaved: r2(futureInterestSavingsTotal),
                fineCollectedNow: r2(overdueFineDueTotal),
                amountAppliedNow: foreclosureAmount,
              },
            },
          },
        });

        return {
          foreclosureAmount,
        };
      },
      { timeout: 30000 }
    );

    return res.json({
      status: 200,
      message: "Loan foreclosed and closed successfully (single receipt).",
      data: {
        required: r2(result.foreclosureAmount),
      },
    });
  } catch (err) {
    console.error("postForeclosurePayment error:", err);
    return res.status(500).json({ error: err.message });
  }
};

exports.reversePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const r2 = (n) => Number((Number(n) || 0).toFixed(2));

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
      // If tied to an EMI, roll back EMI buckets in the same priority we used for apply:
      // fine -> interest -> principal. Bound by current values to avoid underflow.
      if (payment.emiId) {
        const current = await tx.eMI.findUnique({
          where: { id: payment.emiId },
        });
        if (!current) throw new Error("EMI not found for this payment");

        let remaining = r2(payment.amount);

        const canReverseFine = r2(current.finePaid || 0);
        const revFine = Math.min(remaining, canReverseFine);
        remaining = r2(remaining - revFine);

        const canReverseInterest = r2(current.interestPaid || 0);
        const revInterest = Math.min(remaining, canReverseInterest);
        remaining = r2(remaining - revInterest);

        const canReversePrincipal = r2(current.principalPaid || 0);
        const revPrincipal = Math.min(remaining, canReversePrincipal);
        remaining = r2(remaining - revPrincipal);
        // 'remaining' should be ~0, but guard rounding drift.

        // First, decrement raw buckets & totals
        const updatedEmi = await tx.eMI.update({
          where: { id: current.id },
          data: {
            amountPaidSoFar: {
              decrement: r2(revFine + revInterest + revPrincipal),
            }, // total (fine+emi)
            finePaid: { decrement: revFine },
            interestPaid: { decrement: revInterest },
            principalPaid: { decrement: revPrincipal },
            totalPaid: { decrement: r2(revFine + revInterest + revPrincipal) },
          },
        });

        // Recompute dues with the "emi-only paid" rule (exclude finePaid)
        const emiPaidComponent = Math.max(
          Number(updatedEmi.amountPaidSoFar || 0) -
            Number(updatedEmi.finePaid || 0),
          0
        );
        const emiDueAfter = Math.max(
          Number(updatedEmi.emiPayAmount || 0) - emiPaidComponent,
          0
        );

        const { daysLate, fineAmt } = calculateFine(
          updatedEmi.paymentFor,
          emiDueAfter
        );
        const fineAssessed = r2(fineAmt);
        const fineDueAfter = Math.max(
          fineAssessed - Number(updatedEmi.finePaid || 0),
          0
        );

        const newStatus =
          emiDueAfter <= 0 && fineDueAfter <= 0
            ? "PAID"
            : Number(updatedEmi.amountPaidSoFar || 0) > 0
            ? "PARTIAL"
            : "UNPAID";

        await tx.eMI.update({
          where: { id: updatedEmi.id },
          data: {
            status: newStatus,
            fineAmount: fineAssessed,
            delayDays: daysLate,
            isDelayed: daysLate > 0,
          },
        });

        // Adjust loan aggregates ONLY if the original payment had been verified
        if (payment.verified) {
          await tx.loan.update({
            where: { id: payment.loanId },
            data: {
              totalPaidAmount: {
                decrement: r2(revFine + revInterest + revPrincipal),
              },
              totalPaidFine: { decrement: revFine },
              totalPaidInterest: { decrement: revInterest },
              totalPaidPrincipal: { decrement: revPrincipal },
              // pendingAmount tracks only principal+interest
              pendingAmount: { increment: r2(revInterest + revPrincipal) },
            },
          });
        }
      } else {
        // Payment without emiId (e.g., penalty-only). Never affects pendingAmount.
        if (payment.verified) {
          await tx.loan.update({
            where: { id: payment.loanId },
            data: {
              totalPaidAmount: { decrement: r2(payment.amount) },
            },
          });
        }
      }

      // Mark payment as reversed (and un-verify)
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: "REVERSED",
          verified: false,
          verifiedAt: null,
          verifiedByAdminId: null,
          verifiedByEmployeeId: null,
        },
      });

      // Optional: re-check closure flags after reversal
      try {
        const closed = await shouldCloseLoan(tx, payment.loanId);
        await tx.loan.update({
          where: { id: payment.loanId },
          data: { isClosed: closed, fileStatus: closed ? "CLOSED" : "ACTIVE" },
        });
      } catch {
        // no-op if your helper isn't available/throws
      }
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
      verified: payment.verified,
      verifiedAt: payment.verifiedAt,
      isForeclosure: payment.isForeclosure,
      metadata: payment.metadata,
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
        ? [payment.admin.firstName, payment.admin.lastName]
            .filter(Boolean)
            .join(" ")
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
