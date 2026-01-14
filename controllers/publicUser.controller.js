// publicUser.controller.js - Public APIs for users to access loan info via loan ID only (no auth required)
const prisma = require("../lib/prisma");
const Decimal = require("decimal.js");
const { calculateFine } = require("../utils/calculateFine");
const {
  shouldUpdateLoanFines,
  markLoanFinesUpdated,
} = require("../utils/fineUpdateCache");
const { processPostPayment } = require("../utils/loanUtils");
const {
  createPaymentOrder,
  verifyPaymentSignature,
  checkPaymentStatus,
  generatePaymentLink,
  ICICI_CONFIG,
} = require("../utils/iciciPaymentGateway");
const fs = require('fs');
const path = require('path');

// Check if we're in development mode (keys/credentials missing)
const isDevelopmentMode = !fs.existsSync(path.join(__dirname, '../keys/icici_public_key.pem')) ||
                          !fs.existsSync(path.join(__dirname, '../keys/merchant_private_key.pem')) ||
                          !process.env.ICICI_MERCHANT_ID ||
                          !process.env.ICICI_API_KEY;

// Configure Decimal.js for precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Helper for precise rounding
const r2 = (n) => new Decimal(n || 0).toDecimalPlaces(2).toNumber();

/**
 * GET /api/public/loan/:loanId
 * Get basic loan details by loan ID (unauthenticated)
 * Returns: loan info, user details, guarantor info, payment summary
 */
exports.getPublicLoanDetails = async (req, res) => {
  try {
    const { loanId } = req.params;

    // Search by loan ID, fileNo, or registration numbers in related tables
    const loan = await prisma.loan.findFirst({
      where: {
        OR: [
          { id: loanId },
          { fileNo: loanId },
          // Search in two-wheeler loan by registration number
          {
            twoWheelerLoan: {
              registrationNumber: {
                equals: loanId,
                mode: 'insensitive'
              }
            }
          },
          // Search in agriculture loan by registration number
          {
            agriLoan: {
              registrationNumber: {
                equals: loanId,
                mode: 'insensitive'
              }
            }
          },
          // Search in MSME loan by registration number
          {
            msmeLoan: {
              registrationNumber: {
                equals: loanId,
                mode: 'insensitive'
              }
            }
          }
        ]
      },
      include: {
        emi: true,
        payments: true,
        twoWheelerLoan: {
          include: {
            brand: true,
            model: true,
            variant: true,
          },
        },
        agriLoan: {
          include: {
            equipment: true,
          },
        },
        msmeLoan: true,
        seizedHistories: true,
        user: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        loanType: {
          select: {
            id: true,
            name: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        guarantors: {
          include: {
            guarantor: {
              select: {
                id: true,
                firstName: true,
                middleName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!loan) {
      return res.status(404).json({
        error: "Loan not found",
        status: 404
      });
    }

    // Only show active/disbursed loans to public
    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED", "CLOSED", "SEIZED", "SEIZED_INITIATED"].includes(loan.fileStatus)) {
      return res.status(403).json({
        error: "Loan information not available",
        status: 403
      });
    }

    const response = {
      loanId: loan.id,
      fileNo: loan.fileNo,
      fileStatus: loan.fileStatus,
      loanType: loan.loanType?.name,
      branch: loan.branch,
      principalLoanAmount: Number(loan.principalLoanAmount),
      interestRate: Number(loan.interestRate),
      totalAmount: Number(loan.totalAmount),
      totalPaidAmount: Number(loan.totalPaidAmount),
      pendingAmount: Number(loan.pendingAmount),
      totalPaidPrincipal: Number(loan.totalPaidPrincipal || 0),
      totalPaidInterest: Number(loan.totalPaidInterest || 0),
      totalPaidFine: Number(loan.totalPaidFine || 0),
      tenureMonths: loan.tenureMonths,
      dueDay: loan.dueDay,
      paymentFrequency: loan.paymentFrequency,
      startDate: loan.startDate,
      endDate: loan.endDate,
      isClosed: loan.isClosed,
      isDefaulted: loan.isDefaulted,
      emi: loan.emi,
      twoWheelerLoan: loan.twoWheelerLoan,
      agriLoan: loan.agriLoan,
      msmeLoan: loan.msmeLoan,
      seizedHistories: loan.seizedHistories,
      emiCount: loan.emi.length,
      paymentsCount: loan.payments.length,
      payments: loan.payments,
      user: {
        id: loan.user.id,
        firstName: loan.user.firstName,
        middleName: loan.user.middleName,
        lastName: loan.user.lastName,
        phone: loan.user.phone,
        email: loan.user.email,
      },
      guarantors: loan.guarantors?.length > 0
        ? loan.guarantors.map(lg => ({
            name: [
              lg.guarantor.firstName,
              lg.guarantor.middleName,
              lg.guarantor.lastName,
            ]
              .filter(Boolean)
              .join(" "),
            phone: lg.guarantor.phone,
          }))
        : [],
    };

    return res.json({
      status: 200,
      data: response,
    });
  } catch (err) {
    console.error("getPublicLoanDetails error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * GET /api/public/loan/:loanId/payments/pending
 * Get pending EMI list with fine calculations (unauthenticated)
 */
exports.getPublicPendingPayments = async (req, res) => {
  try {
    const { loanId } = req.params;
    const today = new Date();

    // Verify loan exists and is accessible
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      select: { fileStatus: true },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED"].includes(loan.fileStatus)) {
      return res.status(403).json({
        error: "No pending payments for this loan",
        status: 403
      });
    }

    // Update fines if cache expired
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

      const updates = toRefresh.map(async (e) => {
        const emiPaidComponent = new Decimal(e.amountPaidSoFar || 0)
          .minus(new Decimal(e.finePaid || 0))
          .toNumber();

        const outstanding = Math.max(
          new Decimal(e.emiPayAmount || 0).minus(emiPaidComponent).toNumber(),
          0
        );

        const storedFine = r2(e.fineAmount || 0);
        const storedDelay = Number(e.delayDays || 0);
        const storedIsDelayed = Boolean(e.isDelayed || storedDelay > 0);

        let newFine = storedFine;
        let newDelay = storedDelay;
        let isDelayed = storedIsDelayed;

        if (outstanding > 0) {
          const { daysLate, fineAmt } = calculateFine(
            e.paymentFor,
            outstanding
          );
          newFine = r2(fineAmt);
          newDelay = Number(daysLate || 0);
          isDelayed = newDelay > 0;
        }

        if (
          storedFine !== newFine ||
          storedDelay !== newDelay ||
          storedIsDelayed !== isDelayed
        ) {
          return prisma.eMI.update({
            where: { id: e.id },
            data: { fineAmount: newFine, delayDays: newDelay, isDelayed },
          });
        }
        return null;
      });

      await Promise.all(updates);
      markLoanFinesUpdated(loanId);
    }

    // Fetch pending EMIs
    const installments = await prisma.eMI.findMany({
      where: {
        loanId,
        status: { in: ["UNPAID", "PARTIAL"] },
        paymentFor: { lte: today },
      },
      orderBy: { paymentFor: "asc" },
    });

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
      const storedFine = r2(inst.fineAmount || 0);
      const storedDelay = Number(inst.delayDays || 0);

      let daysLate = storedDelay;
      let fineAssessed = storedFine;
      let pct = 0;

      if (outstanding > 0) {
        const fineCalc = calculateFine(inst.paymentFor, outstanding);
        daysLate = Number(fineCalc.daysLate || 0);
        fineAssessed = r2(fineCalc.fineAmt);
        pct = fineCalc.pct || 0;
      }
      const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);

      const totalDue = r2(outstanding + fineDue);
      grandTotal = grandTotal.plus(totalDue);

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
      data: { loanId, pending, grandTotal: grandTotal.toDecimalPlaces(2).toNumber() },
      status: 200,
    });
  } catch (err) {
    console.error("getPublicPendingPayments error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * GET /api/public/loan/:loanId/payments
 * Get payment history for a loan (unauthenticated)
 */
exports.getPublicPaymentHistory = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Verify loan exists
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      select: { fileStatus: true },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    const payments = await prisma.payment.findMany({
      where: {
        loanId,
        status: { in: ["PAID", "VERIFICATION_PENDING"] },
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      orderBy: { paymentDate: "desc" },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMode: true,
        transactionId: true,
        status: true,
        verified: true,
        verifiedAt: true,
        isForeclosure: true,
        metadata: true,
        emiId: true,
      },
    });

    const total = await prisma.payment.count({
      where: {
        loanId,
        status: { in: ["PAID", "VERIFICATION_PENDING"] },
      },
    });

    return res.json({
      status: 200,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      data: payments,
    });
  } catch (err) {
    console.error("getPublicPaymentHistory error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * POST /api/public/loan/:loanId/payment
 * Make a payment (bulk pay) - unauthenticated
 * Supports ICICI payment gateway integration
 */
exports.makePublicPayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    let {
      amountPaid,
      paymentMode,
      transactionId,
      paymentDate,
      // ICICI gateway specific fields
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
    } = req.body;

    amountPaid = r2(Number(amountPaid));
    if (!amountPaid || amountPaid <= 0) {
      return res.status(400).json({
        error: "amountPaid must be more than 0",
        status: 400
      });
    }

    // Verify loan exists and is accessible
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      select: { fileStatus: true },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED"].includes(loan.fileStatus)) {
      return res.status(403).json({
        error: "Cannot make payment for this loan",
        status: 403
      });
    }

    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const result = await prisma.$transaction(
      async (tx) => {
        const today = new Date();

        // Update fines if needed
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
              isDelayed: true,
            },
          });

          const updates = toRefresh.map(async (e) => {
            const emiPaidComponent = new Decimal(e.amountPaidSoFar || 0)
              .minus(new Decimal(e.finePaid || 0))
              .toNumber();

            const emiDue = Math.max(
              new Decimal(e.emiPayAmount || 0).minus(emiPaidComponent).toNumber(),
              0
            );

            const storedFine = r2(e.fineAmount || 0);
            const storedDelay = Number(e.delayDays || 0);
            const storedIsDelayed = Boolean(e.isDelayed || storedDelay > 0);

            let newFine = storedFine;
            let newDelay = storedDelay;
            let isDelayed = storedIsDelayed;

            if (emiDue > 0) {
              const { daysLate, fineAmt } = calculateFine(
                e.paymentFor,
                emiDue
              );
              newFine = r2(fineAmt);
              newDelay = Number(daysLate || 0);
              isDelayed = newDelay > 0;
            }

            if (
              storedFine !== newFine ||
              storedDelay !== newDelay ||
              storedIsDelayed !== isDelayed
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

        // Fetch unpaid/partial EMIs
        const installments = await tx.eMI.findMany({
          where: { loanId, status: { in: ["UNPAID", "PARTIAL"] } },
          orderBy: { paymentFor: "asc" },
          include: {
            loan: { include: { user: true, loanType: true, branch: true } },
          },
        });

        // Public payments always need verification (no auto-verify)
        const verified = false;

        // Create payment record
        const payment = await tx.payment.create({
          data: {
            loanId,
            emiId: null,
            amount: amountPaid,
            paymentMode,
            transactionId: transactionId || gatewayPaymentId || null,
            paymentDate,
            status: "VERIFICATION_PENDING",
            verified: false,
            verifiedAt: null,
            verifiedByAdminId: null,
            verifiedByEmployeeId: null,
            adminId: null,
            employeeId: null,
            metadata: {
              note: "Public payment - distributed across multiple EMIs",
              affectedEmis: [],
              source: "public_api",
              gatewayOrderId: gatewayOrderId || null,
              gatewayPaymentId: gatewayPaymentId || null,
              gatewaySignature: gatewaySignature || null,
            },
          },
        });

        let remaining = r2(amountPaid);
        const updated = [];
        let totalUsed = 0;
        let totalFineCollected = 0;
        let totalInterestCollected = 0;
        let totalPrincipalCollected = 0;

        // Distribute payment across EMIs
        for (const emi of installments) {
          if (remaining <= 0) break;

          const emiPaidComponent = Math.max(
            Number(emi.amountPaidSoFar || 0) - Number(emi.finePaid || 0),
            0
          );
          const emiDue = Math.max(
            Number(emi.emiPayAmount || 0) - emiPaidComponent,
            0
          );

          const storedFine = r2(emi.fineAmount || 0);
          const storedDelay = Number(emi.delayDays || 0);

          let fineAssessed = storedFine;
          let daysLate = storedDelay;

          if (emiDue > 0) {
            const fineCalc = calculateFine(emi.paymentFor, emiDue);
            fineAssessed = r2(fineCalc.fineAmt);
            daysLate = Number(fineCalc.daysLate || 0);
          }
          const fineAlreadyPaid = r2(emi.finePaid || 0);
          const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);

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

          const emiPaidComponentAfter = r2(
            newAmountPaidSoFar - newFinePaid
          );
          const emiDueAfter = r2(Math.max(
            Number(emi.emiPayAmount || 0) - emiPaidComponentAfter,
            0
          ));
          const fineDueAfter = r2(Math.max(fineAssessed - newFinePaid, 0));

          const newStatus =
            emiDueAfter <= 0.01 && fineDueAfter <= 0.01 ? "PAID" : "PARTIAL";

          // Update EMI (but mark as VERIFICATION_PENDING)
          await tx.eMI.update({
            where: { id: emi.id },
            data: {
              amountPaidSoFar: newAmountPaidSoFar,
              finePaid: newFinePaid,
              interestPaid: newInterestPaid,
              principalPaid: newPrincipalPaid,
              totalPaid: newTotalPaid,
              fineAmount: fineAssessed,
              delayDays: daysLate,
              isDelayed: daysLate > 0,
              verified: false,
              status: "VERIFICATION_PENDING",
              payments: { connect: { id: payment.id } },
            },
          });

          // Note: Loan totals will be updated ONLY after admin verification

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
            emiStatus: "VERIFICATION_PENDING",
            daysLate,
            fineAssessed: fineAssessed,
            fineRemaining: r2(fineDueAfter),
            emiRemaining: r2(emiDueAfter),
          });
        }

        // Update payment metadata
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            metadata: {
              note: "Public payment - distributed across multiple EMIs",
              affectedEmis: updated,
              source: "public_api",
              gatewayOrderId: gatewayOrderId || null,
              gatewayPaymentId: gatewayPaymentId || null,
              gatewaySignature: gatewaySignature || null,
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
          message: "Payment submitted successfully. Awaiting admin verification.",
          paymentId: payment.id,
          usedAmount: totalUsed,
          unallocatedAmount: remaining,
          summary: {
            fineCollected: totalFineCollected,
            interestCollected: totalInterestCollected,
            principalCollected: totalPrincipalCollected,
          },
          updatedInstallments: updated,
          requiresVerification: true,
        };
      },
      { timeout: 30000 }
    );

    return res.status(200).json({ data: result, status: 200 });
  } catch (err) {
    console.error("makePublicPayment Error:", err);
    return res.status(500).json({
      error: err.message || "Payment failed",
      status: 500
    });
  }
};

/**
 * POST /api/public/loan/:loanId/payment/emi/:emiId
 * Pay specific EMI (unauthenticated)
 */
exports.payPublicEmiById = async (req, res) => {
  try {
    const { loanId, emiId } = req.params;
    let {
      amount,
      paymentMode,
      transactionId,
      paymentDate,
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
    } = req.body;

    amount = r2(Number(amount));
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "amount must be > 0", status: 400 });
    }

    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const emi = await prisma.eMI.findUnique({
      where: { id: emiId },
      include: { loan: true },
    });

    if (!emi || emi.loanId !== loanId) {
      return res.status(404).json({ error: "EMI not found", status: 404 });
    }

    // Verify loan is accessible
    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED"].includes(emi.loan.fileStatus)) {
      return res.status(403).json({
        error: "Cannot make payment for this loan",
        status: 403
      });
    }

    const emiPaidComponent = Math.max(
      Number(emi.amountPaidSoFar || 0) - Number(emi.finePaid || 0),
      0
    );
    const emiDue = Math.max(
      Number(emi.emiPayAmount || 0) - emiPaidComponent,
      0
    );

    let fineAssessed = r2(emi.fineAmount || 0);
    let daysLate = Number(emi.delayDays || 0);

    if (emiDue > 0) {
      const fineCalc = calculateFine(emi.paymentFor, emiDue);
      fineAssessed = r2(fineCalc.fineAmt);
      daysLate = Number(fineCalc.daysLate || 0);
    }
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

    const txResult = await prisma.$transaction(
      async (tx) => {
        // Create payment
        const payment = await tx.payment.create({
          data: {
            loanId,
            emiId,
            amount: r2(payToFine + payToInterest + payToPrincipal),
            paymentMode,
            transactionId: transactionId || gatewayPaymentId || null,
            paymentDate,
            status: "VERIFICATION_PENDING",
            verified: false,
            verifiedAt: null,
            metadata: {
              source: "public_api",
              gatewayOrderId: gatewayOrderId || null,
              gatewayPaymentId: gatewayPaymentId || null,
              gatewaySignature: gatewaySignature || null,
            },
          },
        });

        // Update EMI
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
            amountPaidSoFar: newAmountPaidSoFar,
            finePaid: newFinePaid,
            interestPaid: newInterestPaid,
            principalPaid: newPrincipalPaid,
            totalPaid: newTotalPaid,
            fineAmount: fineAssessed,
            delayDays: daysLate,
            isDelayed: daysLate > 0,
            status: "VERIFICATION_PENDING",
            payments: { connect: { id: payment.id } },
          },
        });

        return {
          paymentId: payment.id,
          newStatus: "VERIFICATION_PENDING",
        };
      },
      { timeout: 20000 }
    );

    return res.status(200).json({
      data: {
        message: "Payment submitted successfully. Awaiting admin verification.",
        paymentId: txResult.paymentId,
        paid: r2(payToFine + payToInterest + payToPrincipal),
        paidToFine: r2(payToFine),
        paidToInterest: r2(payToInterest),
        paidToPrincipal: r2(payToPrincipal),
        emiId,
        emiStatus: txResult.newStatus,
        requiresVerification: true,
      },
      status: 200,
    });
  } catch (err) {
    console.error("payPublicEmiById error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * GET /api/public/loan/:loanId/payment/:paymentId/receipt
 * Download payment receipt (unauthenticated)
 */
exports.getPublicPaymentReceipt = async (req, res) => {
  try {
    const { loanId, paymentId } = req.params;

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
      },
    });

    if (!payment || payment.loanId !== loanId) {
      return res.status(404).json({ error: "Payment not found", status: 404 });
    }

    // Only show verified/paid receipts
    if (payment.status !== "PAID") {
      return res.status(403).json({
        error: "Receipt not available yet. Payment pending verification.",
        status: 403
      });
    }

    const user = payment.loan.user;
    const loan = payment.loan;
    const emi = payment.emi;

    const receipt = {
      receiptNo: payment.id,
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
        branchAddress: loan.branch?.address || "-",
        branchPhone: loan.branch?.phone || "-",
      },
    };

    res.json({
      status: 200,
      data: receipt
    });
  } catch (err) {
    console.error("getPublicPaymentReceipt error:", err);
    res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * POST /api/public/loan/:loanId/payment/create-order
 * Create ICICI payment order (unauthenticated)
 */
exports.createPaymentGatewayOrder = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { amount, paymentType, emiId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: "Invalid amount",
        status: 400
      });
    }

    // Verify loan exists - search by ID, fileNo, or registration numbers
    const loan = await prisma.loan.findFirst({
      where: {
        OR: [
          { id: loanId },
          { fileNo: loanId },
          {
            twoWheelerLoan: {
              registrationNumber: {
                equals: loanId,
                mode: 'insensitive'
              }
            }
          },
          {
            agriLoan: {
              registrationNumber: {
                equals: loanId,
                mode: 'insensitive'
              }
            }
          },
          {
            msmeLoan: {
              registrationNumber: {
                equals: loanId,
                mode: 'insensitive'
              }
            }
          }
        ]
      },
      include: {
        user: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED", "SEIZED", "SEIZED_INITIATED"].includes(loan.fileStatus)) {
      return res.status(403).json({
        error: "Cannot make payment for this loan",
        status: 403
      });
    }

    // Generate unique order ID using actual loan.id
    const orderId = `LN_${loan.id.substring(0, 8)}_${Date.now()}`;

    const customerName = [
      loan.user.firstName,
      loan.user.middleName,
      loan.user.lastName,
    ]
      .filter(Boolean)
      .join(" ");

    const description = emiId
      ? `EMI Payment - Loan ${loan.fileNo}`
      : `Bulk Payment - Loan ${loan.fileNo}`;

    let orderResult;

    if (isDevelopmentMode) {
      // DEVELOPMENT MODE: Generate mock payment URL
      console.log('📱 [DEV MODE] Creating mock payment order');

      orderResult = {
        success: true,
        orderId: orderId,
        paymentUrl: `http://localhost:3001/dev-payment-simulator?orderId=${orderId}&amount=${amount}`,
        paymentId: `DEV_${Date.now()}`,
        signature: 'DEV_SIGNATURE',
        data: {
          developmentMode: true,
          note: 'Development mode - no actual payment gateway'
        }
      };
    } else {
      // PRODUCTION MODE: Create payment order with ICICI
      orderResult = await createPaymentOrder({
        orderId,
        amount: Number(amount),
        customerName,
        customerEmail: loan.user.email,
        customerPhone: loan.user.phone,
        description,
      });

      if (!orderResult.success) {
        return res.status(500).json({
          error: "Failed to create payment order",
          details: orderResult.error,
          status: 500
        });
      }
    }

    // Store pending order in database (optional - for tracking)
    await prisma.paymentOrder.create({
      data: {
        orderId: orderId,
        loanId: loan.id, // Use actual loan UUID, not the search parameter
        emiId: emiId || null,
        amount: Number(amount),
        paymentType: paymentType || "BULK",
        gatewayOrderId: orderResult.paymentId,
        status: "PENDING",
        metadata: {
          customerName,
          customerEmail: loan.user.email,
          customerPhone: loan.user.phone,
          description,
        },
      },
    }).catch((err) => {
      console.error("Failed to store payment order:", err);
      // Continue even if storage fails
    });

    return res.json({
      status: 200,
      data: {
        orderId: orderId,
        paymentUrl: orderResult.paymentUrl,
        gatewayOrderId: orderResult.paymentId,
        amount: Number(amount),
        signature: orderResult.signature,
      },
    });
  } catch (err) {
    console.error("createPaymentGatewayOrder error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * POST /api/public/payment/callback
 * Handle ICICI payment gateway callback
 */
exports.handlePaymentCallback = async (req, res) => {
  try {
    const {
      orderId,
      paymentId,
      signature,
      status,
      amount,
      transactionId,
    } = req.body;

    console.log("Payment callback received:", { orderId, paymentId, status });

    // Verify signature
    const isValid = verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
      status,
    });

    if (!isValid) {
      console.error("Invalid payment signature");
      return res.status(400).json({
        error: "Invalid signature",
        status: 400
      });
    }

    // Find payment order
    const paymentOrder = await prisma.paymentOrder.findUnique({
      where: { orderId: orderId },
    }).catch(() => null);

    if (!paymentOrder) {
      console.error("Payment order not found:", orderId);
      return res.status(404).json({
        error: "Payment order not found",
        status: 404
      });
    }

    // Update payment order status
    await prisma.paymentOrder.update({
      where: { orderId: orderId },
      data: {
        status: status === "SUCCESS" ? "COMPLETED" : "FAILED",
        gatewayPaymentId: paymentId,
        gatewaySignature: signature,
        transactionId: transactionId,
        completedAt: new Date(),
      },
    }).catch((err) => {
      console.error("Failed to update payment order:", err);
    });

    if (status === "SUCCESS") {
      // Process the payment
      const paymentData = {
        amountPaid: paymentOrder.amount,
        paymentMode: "ONLINE",
        transactionId: transactionId || paymentId,
        paymentDate: new Date(),
        gatewayOrderId: orderId,
        gatewayPaymentId: paymentId,
        gatewaySignature: signature,
      };

      // Call appropriate payment endpoint based on type
      if (paymentOrder.emiId) {
        // EMI-specific payment
        await this.payPublicEmiById(
          {
            params: { loanId: paymentOrder.loanId, emiId: paymentOrder.emiId },
            body: paymentData,
          },
          { json: () => {}, status: () => ({ json: () => {} }) }
        );
      } else {
        // Bulk payment
        await this.makePublicPayment(
          {
            params: { loanId: paymentOrder.loanId },
            body: paymentData,
          },
          { json: () => {}, status: () => ({ json: () => {} }) }
        );
      }

      return res.json({
        status: 200,
        message: "Payment successful",
        data: {
          orderId,
          paymentId,
          amount: paymentOrder.amount,
          loanId: paymentOrder.loanId,
        },
      });
    } else {
      return res.json({
        status: 200,
        message: "Payment failed",
        data: {
          orderId,
          paymentId,
          status,
        },
      });
    }
  } catch (err) {
    console.error("handlePaymentCallback error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * GET /api/public/payment/status/:orderId
 * Check payment status
 */
exports.checkPublicPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Check in database first
    const paymentOrder = await prisma.paymentOrder.findUnique({
      where: { orderId: orderId },
    });

    if (!paymentOrder) {
      return res.status(404).json({
        error: "Payment order not found",
        status: 404
      });
    }

    // If still pending, check with gateway
    if (paymentOrder.status === "PENDING") {
      const gatewayStatus = await checkPaymentStatus(orderId);

      if (gatewayStatus.success) {
        // Update local status
        await prisma.paymentOrder.update({
          where: { orderId: orderId },
          data: {
            status: gatewayStatus.status === "SUCCESS" ? "COMPLETED" : "FAILED",
            gatewayPaymentId: gatewayStatus.paymentId,
            completedAt: new Date(),
          },
        }).catch((err) => {
          console.error("Failed to update payment order:", err);
        });

        return res.json({
          status: 200,
          data: {
            orderId,
            status: gatewayStatus.status,
            amount: gatewayStatus.amount,
            paymentId: gatewayStatus.paymentId,
          },
        });
      }
    }

    return res.json({
      status: 200,
      data: {
        orderId: paymentOrder.orderId,
        status: paymentOrder.status,
        amount: paymentOrder.amount,
        loanId: paymentOrder.loanId,
        createdAt: paymentOrder.createdAt,
        completedAt: paymentOrder.completedAt,
      },
    });
  } catch (err) {
    console.error("checkPublicPaymentStatus error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * POST /api/public/loan/:loanId/payment/generate-qr
 * Generate ICICI UPI QR code for public payment (unauthenticated)
 */
exports.generatePublicQR = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { amount, paymentType } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: 'Valid amount is required',
        status: 400
      });
    }

    // Verify loan exists - search by ID, fileNo, or registration numbers
    const loan = await prisma.loan.findFirst({
      where: {
        OR: [
          { id: loanId },
          { fileNo: loanId },
          {
            twoWheelerLoan: {
              registrationNumber: {
                equals: loanId,
                mode: 'insensitive'
              }
            }
          },
          {
            agriLoan: {
              registrationNumber: {
                equals: loanId,
                mode: 'insensitive'
              }
            }
          },
          {
            msmeLoan: {
              registrationNumber: {
                equals: loanId,
                mode: 'insensitive'
              }
            }
          }
        ]
      },
      include: {
        user: true,
        loanType: true
      }
    });

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found', status: 404 });
    }

    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED", "SEIZED", "SEIZED_INITIATED"].includes(loan.fileStatus)) {
      return res.status(403).json({
        error: "Cannot make payment for this loan",
        status: 403
      });
    }

    // Use the ICICI payment controller's logic
    const iciciController = require('./iciciPayment.controller');
    
    // Create a modified request object with the actual loan ID
    const modifiedReq = {
      ...req,
      body: {
        loanId: loan.id, // Use actual loan UUID
        amount,
        paymentType
      },
      user: null // No user for public payment
    };

    // Call the ICICI controller
    await iciciController.generateQR(modifiedReq, res);
    
  } catch (error) {
    console.error('generatePublicQR error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate QR code',
      status: 500
    });
  }
};

/**
 * GET /api/public/loan/:loanId/payment/upi-status/:merchantTranId
 * Check ICICI UPI transaction status (unauthenticated)
 */
exports.checkPublicUPIStatus = async (req, res) => {
  try {
    const { merchantTranId } = req.params;

    // Use the ICICI payment controller's logic
    const iciciController = require('./iciciPayment.controller');
    
    // Create a modified request object
    const modifiedReq = {
      ...req,
      params: {
        merchantTranId
      },
      user: null // No user for public payment
    };

    // Call the ICICI controller
    await iciciController.checkTransactionStatus(modifiedReq, res);
    
  } catch (error) {
    console.error('checkPublicUPIStatus error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to check transaction status',
      status: 500
    });
  }
};
