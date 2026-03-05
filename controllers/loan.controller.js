const prisma = require("../lib/prisma");
const {
  addMonths,
  setDate,
  isAfter,
  differenceInDays,
  getMonth,
  getYear,
  startOfMonth,
  isBefore,
  addYears,
} = require("date-fns");
const logAction = require("../utils/adminLogger");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
const { calculateFine } = require("../utils/calculateFine");

// Helper function to safely parse dates (handles ISO strings and Date objects)
// Dates from frontend are already in Indian timezone when sent as ISO strings
const parseDate = (dateInput) => {
  if (!dateInput) return null;
  // If it's already a Date object, return it
  if (dateInput instanceof Date) return dateInput;
  // Parse ISO string - browser sends dates in local timezone (Indian time)
  return new Date(dateInput);
};

const toLogValue = (value) => {
  if (value === undefined || value === null || value === "") return "-";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value);
};

const LOAN_FIELD_LABELS = {
  principalLoanAmount: "Principal amount",
  interestRate: "Interest rate (%)",
  tenureMonths: "Tenure (months)",
  paymentFrequency: "Payment frequency",
  startDate: "Start date",
  dueDay: "Due day",
  branchId: "Branch",
  showroomId: "Showroom",
  loanTypeId: "Loan type",
  fileStatus: "File status",
};

const buildLoanChanges = (before, payload = {}) => {
  const changes = [];
  Object.entries(LOAN_FIELD_LABELS).forEach(([field, label]) => {
    if (!(field in payload)) return;
    const fromRaw = before?.[field];
    const toRaw = payload?.[field];
    if (String(fromRaw ?? "") === String(toRaw ?? "")) return;
    changes.push({
      field,
      label,
      from: toLogValue(fromRaw),
      to: toLogValue(toRaw),
      message: `Updated ${label} from ${toLogValue(fromRaw)} to ${toLogValue(toRaw)}`,
    });
  });
  return changes;
};

const FREQUENCY_OFFSETS = {
  MONTHLY: { fn: addMonths, step: 1, months: 1 },
  QUARTERLY: { fn: addMonths, step: 3, months: 3 },
  HALF_YEARLY: { fn: addMonths, step: 6, months: 6 },
  YEARLY: { fn: addYears, step: 1, months: 12 },
};
const FREQUENCY_MONTHS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};
const PENDING_APPROVAL_STATUSES = [
  "PENDING_APPROVAL",
  "INITIATED",
  "IN_PROGRESS",
];

const normalizeFileInput = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.length ? value[0] : null;
  }
  return value;
};

const createOrGetFileId = async (tx, filePayload) => {
  if (!filePayload) return null;
  if (filePayload.id) return filePayload.id;

  const url = filePayload.secure_url || filePayload.url;
  const publicId = filePayload.public_id || filePayload.publicId;
  if (!url || !publicId) return null;

  const resourceType = filePayload.resource_type || filePayload.resourceType || "image";
  const format = filePayload.format || "raw";

  const created = await tx.file.create({
    data: {
      url,
      publicId,
      resourceType,
      format,
    },
  });

  return created.id;
};

const buildCreateFileRelation = async (tx, filePayload) => {
  const normalized = normalizeFileInput(filePayload);
  if (!normalized) return null;
  const fileId = await createOrGetFileId(tx, normalized);
  return fileId ? { connect: [{ id: fileId }] } : null;
};

const buildUpdateFileRelation = async (tx, filePayload) => {
  if (filePayload === undefined) return null;
  const normalized = normalizeFileInput(filePayload);
  if (!normalized) {
    return { set: [] };
  }
  const fileId = await createOrGetFileId(tx, normalized);
  return fileId ? { set: [{ id: fileId }] } : { set: [] };
};

// Helper function to generate EMI schedule
const generateEMISchedule = ({
  principalLoanAmount,
  interestRate,
  tenureMonths,
  startDate,
  paymentFrequency = "MONTHLY",
}) => {
  // Round to whole numbers (no decimals)
  const round2 = (x) => Math.round(Number(x) || 0);

  const P = Number(principalLoanAmount);
  const n = parseInt(tenureMonths, 10);
  const annualRate = Number(interestRate);

  // Calculate totals using SIMPLE interest (not compound)
  // Simple Interest = P × R × T / 100
  // where T is in years (n months / 12)
  const totalInterest = round2((P * annualRate * (n / 12)) / 100);
  const totalPayable = round2(P + totalInterest);

  // Per-month equal split
  const monthlyPrincipal = P / n;
  const monthlyInterest = totalInterest / n;
  const monthlyEMI = totalPayable / n;

  // Frequency config
  const freq = (paymentFrequency || "MONTHLY").toUpperCase();
  const { fn: offsetFn, step } = FREQUENCY_OFFSETS[freq] || FREQUENCY_OFFSETS.MONTHLY;
  const monthsPerInstallment = FREQUENCY_MONTHS[freq] || 1;

  // Build schedule
  // First due date = startDate itself (dueDay is extracted from startDate)
  let firstDue = parseDate(startDate);

  const numInstallments = Math.ceil(n / monthsPerInstallment);
  const schedule = [];

  let aggPrincipal = 0;
  let aggInterest = 0;

  for (let i = 0; i < numInstallments; i++) {
    const monthsInThisBucket = Math.min(
      monthsPerInstallment,
      n - i * monthsPerInstallment
    );

    const dueDate = offsetFn(firstDue, step * i);

    let principalAmt = round2(monthlyPrincipal * monthsInThisBucket);
    let interestAmt = round2(monthlyInterest * monthsInThisBucket);
    let emiPayAmount = round2(monthlyEMI * monthsInThisBucket);

    aggPrincipal = round2(aggPrincipal + principalAmt);
    aggInterest = round2(aggInterest + interestAmt);

    schedule.push({
      paymentFor: dueDate,
      paymentDate: dueDate,
      emiPayAmount,
      principalAmt,
      interestAmt,
      amountPaidSoFar: 0,
      fineAmount: 0,
      status: "UNPAID",
      isDelayed: false,
      isForeclosure: false,
    });
  }

  // Fix rounding drift on the last row
  const principalDrift = round2(P - aggPrincipal);
  const interestDrift = round2(totalInterest - aggInterest);

  if (schedule.length > 0) {
    const lastRow = schedule[schedule.length - 1];
    lastRow.principalAmt = round2(lastRow.principalAmt + principalDrift);
    lastRow.interestAmt = round2(lastRow.interestAmt + interestDrift);
    lastRow.emiPayAmount = round2(lastRow.principalAmt + lastRow.interestAmt);
  }

  return schedule;
};

// ====================
// 🟢 CREATE LOAN (fixed)
// ====================
exports.createLoan = async (req, res) => {
  try {
    const {
      userId,
      loanTypeId,
      // productAmount, // REMOVED: No longer collecting
      // downPayment = 0, // REMOVED: No longer collecting
      principalLoanAmount,
      interestRate, // Annual %, e.g. 14
      tenureMonths, // total months
      startDate, // JS/ISO date
      paymentFrequency = "MONTHLY",
      details, // subtype payload
      fileNo,
      disbursedDate,
      agreementDate,
      rtoCharges: rtoChargesRaw,
      processingCharges: processingChargesRaw,
      otherCharges: otherChargesRaw,
      // ourPaymentType, // REMOVED: Payment setup section removed
      insuranceAmount,
      insuranceDate,
      insuranceValidTill,
      insuranceAlert,
      insuranceNumber,
      insuranceCompany,
      loanInvoiceDoc,
      insuranceDoc,
      registrationDoc,
      comment,
      branchId,
      interestType,
      penaltyPercentage,
    } = req.body;

    // Round to whole numbers (no decimals)
  const round2 = (x) => Math.round(Number(x) || 0);

    // Convert charge fields to Float or null
    const rtoCharges = rtoChargesRaw && rtoChargesRaw !== "" ? parseFloat(rtoChargesRaw) : null;
    const processingCharges = processingChargesRaw && processingChargesRaw !== "" ? parseFloat(processingChargesRaw) : null;
    const otherCharges = otherChargesRaw && otherChargesRaw !== "" ? parseFloat(otherChargesRaw) : null;

    // Convert penaltyPercentage to Float
    const penaltyPct = penaltyPercentage && penaltyPercentage !== "" ? parseFloat(penaltyPercentage) : 0;

    // // 1) Validate startDate is provided
    // if (!startDate) {
    //   return res.status(400).json({ error: "startDate is required" });
    // }

    // Parse core dates
    const parsedStartDate = parseDate(startDate);
    const parsedDisbursedDate = parseDate(disbursedDate);
    const parsedAgreementDate = parseDate(agreementDate);

    // Calculate dueDay from startDate when available
    const dueDay = parsedStartDate ? parsedStartDate.getDate() : null;

    // 2) Validate principal & tenure
    const P = Number(principalLoanAmount);
    if (!P || P <= 0) {
      return res.status(400).json({ error: "principalLoanAmount must be > 0" });
    }
    const n = parseInt(tenureMonths, 10);
    if (!n || n < 1) {
      return res.status(400).json({ error: "tenureMonths must be >= 1" });
    }
    const annualRate = Number(interestRate);
    if (Number.isNaN(annualRate) || annualRate < 0) {
      return res.status(400).json({ error: "interestRate must be >= 0" });
    }

    // 2) Totals using SIMPLE interest (not compound)
    // Simple Interest = P × R × T / 100
    // where T is in years (n months / 12)
    const totalInterest = round2((P * annualRate * (n / 12)) / 100);
    const totalPayable = round2(P + totalInterest);

    const freq = (paymentFrequency || "MONTHLY").toUpperCase();

    // Validate EMI is a whole number
    const freqMonths = FREQUENCY_MONTHS[freq] || 1;
    const numInstallments = Math.ceil(n / freqMonths);
    const rawEMI = totalPayable / numInstallments;
    if (!Number.isInteger(rawEMI) && Math.abs(rawEMI - Math.round(rawEMI)) > 0.001) {
      return res.status(400).json({
        error: `EMI amount (${rawEMI.toFixed(2)}) is not a whole number. Adjust the interest rate or installment amount so the total payable (${totalPayable}) divides evenly into ${numInstallments} installments.`,
        status: 400,
      });
    }

    // 3) Build schedule only if start/end dates are available
    const schedule = parsedStartDate
      ? generateEMISchedule({
          principalLoanAmount: P,
          interestRate: annualRate,
          tenureMonths: n,
          startDate: parsedStartDate,
          paymentFrequency: freq,
        })
      : [];
    const representativeInstallment =
      schedule[0]?.emiPayAmount ?? round2(totalPayable / n);
    const computedEndDate =
      schedule.length > 0 ? schedule[schedule.length - 1].paymentFor : null;
    // Store placeholder dates when EMI schedule is pending so Prisma's NOT NULL constraints are satisfied.
    const fallbackStartDate =
      parsedAgreementDate || parsedDisbursedDate || new Date();
    const fallbackEndDate = addMonths(new Date(fallbackStartDate), n);
    const scheduleFields = parsedStartDate
      ? {
          startDate: parsedStartDate,
          endDate: computedEndDate,
          dueDay,
        }
      : {
          startDate: fallbackStartDate,
          endDate: fallbackEndDate,
        };

    // 4) Permission check
    const isAdmin = req.user.type === "ADMIN";
    if (!isAdmin) {
      const canCreate = await checkVerifyPermission(req.user, "LOAN_CREATE");
      if (!canCreate) {
        return res
          .status(403)
          .json({ error: "You do not have permission to create loans" });
      }
    }

    // 5) Transaction: Loan, subtypes, schedule, log
    const created = await prisma.$transaction(
      async (tx) => {
        const invoiceDocRelation = await buildCreateFileRelation(
          tx,
          loanInvoiceDoc
        );
        const insuranceDocRelation = await buildCreateFileRelation(
          tx,
          insuranceDoc
        );
        const registrationDocRelation = await buildCreateFileRelation(
          tx,
          registrationDoc
        );
        // a) Core loan
        const loan = await tx.loan.create({
          data: {
            user: { connect: { id: userId } },
            loanType: { connect: { id: loanTypeId } },
            branch: { connect: { id: branchId } },

            fileNo,
            // productAmount, // REMOVED
            // downPayment, // REMOVED

            principalLoanAmount: P,
            interestAmount: round2(totalPayable - P),
            totalAmount: round2(totalPayable),

            // per-installment amount (first row is representative)
            monthlyPayableAmount: representativeInstallment,

            pendingAmount: round2(totalPayable),
            interestRate: annualRate,
            interestType,
            penaltyPercentage: penaltyPct,
            tenureMonths: n,
            paymentFrequency: freq,

            rtoCharges,
            processingCharges,
            otherCharges,
            // ourPaymentType, // REMOVED

            ...scheduleFields,

            fileStatus: "PENDING_APPROVAL",
            disbursedDate: parsedDisbursedDate,
            agreementDate: parsedAgreementDate,

            insuranceAmount: insuranceAmount && insuranceAmount !== "" ? parseFloat(insuranceAmount) : null,
            insuranceDate: parseDate(insuranceDate),
            insuranceValidTill: parseDate(insuranceValidTill),
            insuranceAlert: String(insuranceAlert) === "true",
            insuranceNumber: insuranceNumber || null,
            insuranceCompany: insuranceCompany || null,
            ...(invoiceDocRelation && {
              loanInvoiceDoc: invoiceDocRelation,
            }),
            ...(insuranceDocRelation && {
              insuranceDoc: insuranceDocRelation,
            }),
            ...(registrationDocRelation && {
              registrationDoc: registrationDocRelation,
            }),
            comment,

            createdBy: req.user.type,
            admin: isAdmin ? { connect: { id: req.user.adminId } } : undefined,
            employee: !isAdmin
              ? { connect: { id: req.user.employeeId } }
              : undefined,
          },
        });

        // b) Sub-type
        const lt = await tx.loanType.findUnique({ where: { id: loanTypeId } });
        if (lt.name === "TWOWHEELER") {
          await tx.twoWheelerLoan.create({
            data: {
              loanId: loan.id,
              vehicleName: details?.vehicleName ?? "",
              brandId: details?.brandId ?? null,
              modelId: details?.modelId ?? null,
              registrationNumber: details?.registrationNumber ?? "",
              chassisNumber: details?.chassisNumber ?? "",
              engineNumber: details?.engineNumber ?? "",
            },
          });
        } else if (lt.name === "AGRICULTURE") {
          await tx.agricultureLoan.create({
            data: {
              loan: { connect: { id: loan.id } },
              equipment: details?.equipmentId
                ? { connect: { id: details.equipmentId } }
                : undefined,
              usageArea: details?.usageArea ?? "",
              isSeasonal: Boolean(details?.isSeasonal),
            },
          });
        } else if (lt.name === "MSME") {
          await tx.mSMELoan.create({
            data: {
              loanId: loan.id,
              businessName: details?.businessName ?? "",
              registrationNumber: details?.registrationNumber ?? "",
              businessType: details?.businessType ?? "",
              monthlyRevenue: details?.monthlyRevenue ?? null,
              gstNumber: details?.gstNumber ?? "",
            },
          });
        }

        // c) EMI schedule will be created during approval

        // d) Audit log
        await logAction({
          action: "CREATED_LOAN",
          table: "Loan",
          targetId: loan.id,
          message: `Created loan ${loan.fileNo || loan.id}`,
          metadata: {
            loanId: loan.id,
            fileNo: loan.fileNo || null,
            userId: loan.userId,
            amount: loan.totalAmount,
            paymentFrequency: loan.paymentFrequency,
          },
          loginActivityId: req.user.loginActivityId,
          adminId: req.user.adminId,
          employeeId: req.user.employeeId,
          prisma: tx,
        });

        return loan;
      },
      { maxWait: 2000, timeout: 30000 }
    );

    return res
      .status(201)
      .json({ message: "Loan created", data: created, status: 201 });
  } catch (err) {
    console.error("Create Loan Error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

// ====================
// 🔄 UPDATE LOAN
// ====================
exports.updateLoan = async (req, res) => {
  try {
    const loanId = req.params.id;
    const payload = req.body;

    // 1) fetch existing (with payments)
    const existing = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        payments: true,
        loanInvoiceDoc: true,
        insuranceDoc: true,
        registrationDoc: true,
      },
    });
    if (!existing) {
      return res.status(404).json({ error: "Loan not found" });
    }

    // Check if loan is closed or foreclosed - NO EDITS ALLOWED
    if (existing.isClosed || existing.isForeclosed || existing.fileStatus === "CLOSED" || existing.fileStatus === "FORECLOSED") {
      return res.status(403).json({
        error: "Cannot edit a closed or foreclosed loan"
      });
    }

    // Check if loan is approved and has payments - restrict EMI/date changes
    const isApproved = existing.fileStatus === "ACTIVE" || existing.fileStatus === "DISBURSED" || existing.fileStatus === "APPROVED";
    const hasPayments = existing.payments && existing.payments.length > 0;
    const cannotModifySchedule = isApproved && hasPayments;

    // 2) new vs old
    const newPct = payload.interestRate ?? existing.interestRate;
    // REMOVED: productAmount and downPayment fields
    // const newProd = payload.productAmount ?? existing.productAmount;
    // const newDown = payload.downPayment ?? existing.downPayment;
    // const newPrincipal = newProd - newDown;
    const newPrincipal = payload.principalLoanAmount ?? existing.principalLoanAmount;
    if (newPrincipal <= 0) {
      return res.status(400).json({ error: "Principal must be > 0" });
    }

    const newTenure = payload.tenureMonths ?? existing.tenureMonths;
    const newFreq = payload.paymentFrequency ?? existing.paymentFrequency;
    const newStartDate = payload.startDate
      ? parseDate(payload.startDate)
      : existing.startDate;
    // Calculate dueDay from newStartDate (day of month)
    const newDueDay = newStartDate.getDate();
    const newLoanTypeId = payload.loanTypeId ?? existing.loanTypeId;

    // 3) schedule reset?
    const mustReset =
      existing.paymentFrequency !== newFreq ||
      existing.tenureMonths !== newTenure ||
      existing.interestRate !== newPct ||
      existing.startDate.getTime() !== newStartDate.getTime() ||
      existing.dueDay !== newDueDay;

    // If loan has payments and is approved, prevent schedule-affecting changes
    if (cannotModifySchedule && mustReset) {
      return res.status(403).json({
        error: "Cannot modify EMI schedule or dates for an approved loan with existing payments. Changes to interest rate, tenure, payment frequency, start date, or due day are not allowed."
      });
    }

    // Also prevent principal amount changes if there are payments
    if (cannotModifySchedule && existing.principalLoanAmount !== newPrincipal) {
      return res.status(403).json({
        error: "Cannot modify principal loan amount for an approved loan with existing payments."
      });
    }

    // 4) recalc EMI & total using SIMPLE interest (matching createLoan)
    const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

    // Generate temporary schedule to get precise totals and representative EMI
    const tempSchedule = generateEMISchedule({
      principalLoanAmount: newPrincipal,
      interestRate: newPct,
      tenureMonths: newTenure,
      startDate: newStartDate,
      paymentFrequency: newFreq,
    });

    const totalInterest = round2(tempSchedule.reduce((sum, row) => sum + row.interestAmt, 0));
    const totalPayable = round2(newPrincipal + totalInterest);
    const representativeEMI = tempSchedule[0]?.emiPayAmount ?? round2(totalPayable / newTenure);
    const EMI = representativeEMI;
    const paidEmiComponent = round2(
      Number(existing.totalPaidPrincipal || 0) + Number(existing.totalPaidInterest || 0)
    );

    // 5) permissions
    const canSelfApprove =
      req.user.type === "ADMIN" ||
      (await checkVerifyPermission(req.user, "LOAN_APPROVE"));
    const newFileStatus = canSelfApprove ? "ACTIVE" : existing.fileStatus;

    // 6) frequency helpers
    const freqCfg = FREQUENCY_OFFSETS[newFreq] || FREQUENCY_OFFSETS.MONTHLY;
    const { fn: offsetFn, step } = freqCfg;
    const monthsPerInstallment = FREQUENCY_MONTHS[newFreq] || 1;

    // 7) transaction
    const updatedLoan = await prisma.$transaction(
      async (tx) => {
        const invoiceDocRelation = await buildUpdateFileRelation(
          tx,
          payload.loanInvoiceDoc
        );
        const insuranceDocRelation = await buildUpdateFileRelation(
          tx,
          payload.insuranceDoc
        );
        const registrationDocRelation = await buildUpdateFileRelation(
          tx,
          payload.registrationDoc
        );
        // a) update loan
        const loan = await tx.loan.update({
          where: { id: loanId },
          data: {
            loanType: { connect: { id: newLoanTypeId } },
            // productAmount: newProd, // REMOVED
            // downPayment: newDown, // REMOVED
            principalLoanAmount: newPrincipal,
            interestAmount: Math.round(totalPayable - newPrincipal),
            totalAmount: Math.round(totalPayable),
            monthlyPayableAmount: Math.round(EMI),
            // Pending tracks only principal + interest (fine/penalty is separate).
            pendingAmount: Math.max(Math.round(totalPayable - paidEmiComponent), 0),
            interestRate: newPct,
            tenureMonths: newTenure,
            paymentFrequency: newFreq,
            startDate: newStartDate,
            dueDay: newDueDay,
            endDate: (() => {
              // Calculate end date based on tenure and frequency
              const numInstallments = Math.ceil(newTenure / monthsPerInstallment);
              return offsetFn(newStartDate, step * (numInstallments - 1));
            })(),
            fileNo: payload.fileNo ?? existing.fileNo,
            disbursedDate: payload.disbursedDate ? parseDate(payload.disbursedDate) : existing.disbursedDate,
            agreementDate: payload.agreementDate ? parseDate(payload.agreementDate) : existing.agreementDate,
            rtoCharges: payload.rtoCharges ? parseFloat(payload.rtoCharges) : existing.rtoCharges,
            processingCharges: payload.processingCharges ? parseFloat(payload.processingCharges) : existing.processingCharges,
            otherCharges: payload.otherCharges ? parseFloat(payload.otherCharges) : existing.otherCharges,
            // ourPaymentType: payload.ourPaymentType ?? existing.ourPaymentType, // REMOVED
            insuranceAmount: payload.insuranceAmount ? parseFloat(payload.insuranceAmount) : existing.insuranceAmount,
            insuranceDate: payload.insuranceDate ? parseDate(payload.insuranceDate) : existing.insuranceDate,
            insuranceValidTill: payload.insuranceValidTill ? parseDate(payload.insuranceValidTill) : existing.insuranceValidTill,
            insuranceAlert:
              payload.insuranceAlert === undefined
                ? existing.insuranceAlert
                : payload.insuranceAlert === "true",
            insuranceNumber:
              payload.insuranceNumber ?? existing.insuranceNumber,
            insuranceCompany:
              payload.insuranceCompany ?? existing.insuranceCompany,
            ...(invoiceDocRelation !== null && {
              loanInvoiceDoc: invoiceDocRelation,
            }),
            ...(insuranceDocRelation !== null && {
              insuranceDoc: insuranceDocRelation,
            }),
            ...(registrationDocRelation !== null && {
              registrationDoc: registrationDocRelation,
            }),
            comment: payload.comment ?? existing.comment,
            branch: payload.branchId
              ? { connect: { id: payload.branchId } }
              : undefined,
            fileStatus: newFileStatus,
          },
        });

        // b) reset schedule? (Flat Rate matching createLoan)
        if (mustReset) {
          await tx.eMI.deleteMany({ where: { loanId } });

          let bal = newPrincipal;
          const newSchedule = [];
          // First due date = newStartDate itself (since dueDay is extracted from newStartDate)
          let firstDue = newStartDate;

          for (let i = 0; i < newTenure; i++) {
            const dueDate = offsetFn(firstDue, step * i);
            const intPort = Math.round(bal * (newPct / 100 / 12));
            const priPort = Math.round(EMI - intPort);
            bal = Math.round(bal - priPort);

            newSchedule.push({
              loanId: loan.id,
              paymentFor: dueDate,
              paymentDate: dueDate,
              emiPayAmount: Math.round(EMI),
              principalAmt: priPort,
              interestAmt: intPort,
              amountPaidSoFar: 0,
              fineAmount: 0,
              status: "UNPAID",
              paymentStatus: "PENDING",
              isDelayed: false,
              isForeclosure: false,
            });
          }
          await tx.eMI.createMany({ data: newSchedule });
        }

        // c) upsert subtype
        const ltRec = await tx.loanType.findUnique({
          where: { id: newLoanTypeId },
        });
        if (ltRec.name === "TWOWHEELER" && payload.details) {
          await tx.twoWheelerLoan.upsert({
            where: { loanId: loan.id },
            create: {
              loan: { connect: { id: loan.id } },
              vehicleName: payload.details.vehicleName,
              brand: { connect: { id: payload.details.brandId } },
              model: { connect: { id: payload.details.modelId } },
              registrationNumber: payload.details.registrationNumber,
              chassisNumber: payload.details.chassisNumber,
              engineNumber: payload.details.engineNumber,
            },
            update: {
              vehicleName: payload.details.vehicleName,
              brand: { connect: { id: payload.details.brandId } },
              model: { connect: { id: payload.details.modelId } },
              registrationNumber: payload.details.registrationNumber,
              chassisNumber: payload.details.chassisNumber,
              engineNumber: payload.details.engineNumber,
            },
          });
        } else if (ltRec.name === "AGRICULTURE" && payload.details) {
          await tx.agricultureLoan.upsert({
            where: { loanId: loan.id },
            create: {
              loan: { connect: { id: loan.id } },
              equipment: { connect: { id: payload.details.equipmentId } },
              usageArea: payload.details.usageArea,
              isSeasonal: payload.details.isSeasonal || false,
            },
            update: {
              equipment: { connect: { id: payload.details.equipmentId } },
              usageArea: payload.details.usageArea,
              isSeasonal: payload.details.isSeasonal || false,
            },
          });
        } else if (ltRec.name === "MSME" && payload.details) {
          await tx.mSMELoan.upsert({
            where: { loanId: loan.id },
            create: { loanId: loan.id, ...payload.details },
            update: { ...payload.details },
          });
        }

        // d) audit
        await logAction({
          action: "UPDATED_LOAN",
          table: "Loan",
          targetId: loan.id,
          metadata: (() => {
            const changes = buildLoanChanges(existing, payload);
            return {
              loanId: loan.id,
              fileNo: loan.fileNo || existing.fileNo || null,
              changes,
              summary:
                changes.length === 1
                  ? changes[0].message
                  : changes.length > 1
                  ? `Updated ${changes.length} loan fields`
                  : "Updated loan details",
            };
          })(),
          message: "Updated loan details",
          loginActivityId: req.user.loginActivityId,
          adminId: req.user.adminId,
          employeeId: req.user.employeeId,
          prisma: tx,
        });

        return loan;
      },
      {
        maxWait: 2000,
        timeout: 30000,
      }
    );

    return res.json({
      message: "Loan updated successfully",
      data: updatedLoan,
    });
  } catch (err) {
    console.error("Update Loan Error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// List Loans by User
exports.listLoansByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const loans = await prisma.loan.findMany({
      where: { userId },
      include: {
        emi: true,
        payments: true,
        loanType: true,
        twoWheelerLoan: true,
        agriLoan: true,
        msmeLoan: true,
      },
    });
    res.json(loans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Close Loan
exports.closeLoan = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate loan exists and check closure eligibility
    const existingLoan = await prisma.loan.findUnique({
      where: { id },
      select: {
        id: true,
        fileNo: true,
        isClosed: true,
        isForeclosed: true,
        pendingAmount: true,
      }
    });

    if (!existingLoan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    if (existingLoan.isClosed) {
      return res.status(400).json({
        error: "Loan is already closed",
        status: 400
      });
    }

    if (existingLoan.isForeclosed) {
      return res.status(400).json({
        error: "Loan is already foreclosed",
        status: 400
      });
    }

    // Check if all EMIs are paid
    const pendingEmis = await prisma.eMI.count({
      where: {
        loanId: id,
        status: { in: ["UNPAID", "PARTIAL", "VERIFICATION_PENDING"] }
      },
    });

    if (pendingEmis > 0) {
      return res.status(400).json({
        error: `Cannot close loan: ${pendingEmis} EMI(s) are still pending`,
        status: 400
      });
    }

    // Check for unverified payments
    const unverifiedPayments = await prisma.payment.count({
      where: {
        loanId: id,
        verified: false,
        status: { in: ["VERIFICATION_PENDING", "PENDING"] }
      }
    });

    if (unverifiedPayments > 0) {
      return res.status(400).json({
        error: `Cannot close loan: ${unverifiedPayments} payment(s) awaiting verification`,
        status: 400
      });
    }

    const r2 = (n) => Math.round(Number(n) || 0);
    if (r2(existingLoan.pendingAmount) > 0) {
      return res.status(400).json({
        error: `Cannot close loan: Pending amount of ₹${r2(existingLoan.pendingAmount)} remains`,
        status: 400
      });
    }

    // All validations passed - close the loan
    const loan = await prisma.loan.update({
      where: { id },
      data: {
        isClosed: true,
        fileStatus: "CLOSED"
      },
    });

    await logAction({
      action: "CLOSED LOAN",
      table: "Loan",
      targetId: id,
      metadata: loan,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({
      message: "Loan closed successfully",
      data: loan,
      status: 200
    });
  } catch (err) {
    console.error("Close Loan Error:", err);
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.getPendingLoanDetails = async (req, res) => {
  try {
    const { loanId } = req.params;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const emiWhere = {
      status: { in: ["UNPAID", "PARTIAL"] },
      paymentFor: { lte: today },
      ...(loanId ? { loanId } : {}),
      loan: {
        isClosed: false,
      },
    };

    const pendingEmis = await prisma.eMI.findMany({
      where: emiWhere,
      orderBy: [{ paymentFor: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        loanId: true,
        paymentFor: true,
        emiPayAmount: true,
        amountPaidSoFar: true,
        fineAmount: true,
        finePaid: true,
        loan: {
          select: {
            id: true,
            fileNo: true,
            loanType: { select: { id: true, name: true, label: true } },
            branch: { select: { id: true, name: true } },
            user: {
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

    const loanMap = new Map();
    const r2 = (n) => Math.round(Number(n) || 0);

    for (const emi of pendingEmis) {
      const key = emi.loanId;
      if (!loanMap.has(key)) {
        const user = emi.loan?.user || {};
        loanMap.set(key, {
          loanId: emi.loanId,
          fileNo: emi.loan?.fileNo || null,
          userId: user.id || null,
          userName: [user.firstName, user.middleName, user.lastName]
            .filter(Boolean)
            .join(" "),
          phone: user.phone || null,
          loanType: emi.loan?.loanType || null,
          branch: emi.loan?.branch || null,
          pendingCount: 0,
          totalPendingAmount: 0,
          totalPendingPenalty: 0,
          totalPendingDue: 0,
          oldestDueDate: emi.paymentFor,
          pendingEmis: [],
        });
      }

      const bucket = loanMap.get(key);
      const emiPaidComponent = Math.max(
        Number(emi.amountPaidSoFar || 0) - Number(emi.finePaid || 0),
        0
      );
      const emiDue = Math.max(Number(emi.emiPayAmount || 0) - emiPaidComponent, 0);
      const fineDue = Math.max(
        Number(emi.fineAmount || 0) - Number(emi.finePaid || 0),
        0
      );

      bucket.pendingCount += 1;
      bucket.totalPendingAmount = r2(bucket.totalPendingAmount + emiDue);
      bucket.totalPendingPenalty = r2(bucket.totalPendingPenalty + fineDue);
      bucket.totalPendingDue = r2(
        bucket.totalPendingAmount + bucket.totalPendingPenalty
      );
      if (emi.paymentFor < bucket.oldestDueDate) {
        bucket.oldestDueDate = emi.paymentFor;
      }
      bucket.pendingEmis.push({
        emiId: emi.id,
        dueDate: emi.paymentFor,
        dueAmount: r2(emiDue),
        duePenalty: r2(fineDue),
        totalDue: r2(emiDue + fineDue),
      });
    }

    const data = Array.from(loanMap.values()).sort(
      (a, b) => b.totalPendingDue - a.totalPendingDue
    );

    res.set("Deprecation", "true");
    res.set("Warning", '299 - "Deprecated endpoint. Prefer /api/report/pending-emis"');

    res.status(200).json({
      status: 200,
      deprecated: true,
      data,
      summary: {
        totalLoans: data.length,
        totalPendingAmount: r2(data.reduce((sum, row) => sum + row.totalPendingAmount, 0)),
        totalPendingPenalty: r2(data.reduce((sum, row) => sum + row.totalPendingPenalty, 0)),
        totalPendingDue: r2(data.reduce((sum, row) => sum + row.totalPendingDue, 0)),
      },
    });
  } catch (err) {
    console.error("Pending loan error:", err);
    res.status(500).json({ error: "Failed to fetch pending loans" });
  }
};

exports.listLoans = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      regionId,
      stateId,
      cityId,
      branchId,
      showroomId,
      isClosed,
      isDefaulted,
      fileStatus,
      search,
      fromDate,
      toDate,
      includeTotal = false,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (page - 1) * limit;

    let filterStateId = stateId;
    let filterCityId = cityId;

    // 🌍 Resolve state & city from regionId if passed
    if (regionId) {
      const region = await prisma.region.findUnique({
        where: { id: regionId },
        select: { stateId: true, cityId: true },
      });

      if (!region) {
        return res.status(404).json({ error: "Region not found" });
      }

      filterStateId = region.stateId;
      filterCityId = region.cityId;
    }

    // 🧠 Build filter
    const loanWhere = {
      ...(isClosed !== undefined && { isClosed: isClosed === "true" }),
      ...(isDefaulted !== undefined && { isDefaulted: isDefaulted === "true" }),
      ...(fileStatus && { fileStatus }),
      ...(branchId && { branchId }),
      ...(showroomId && { showroomId }),
      ...(fromDate &&
        toDate && {
          startDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
    };

    const userLocationFilter = {};
    if (filterStateId || filterCityId) {
      userLocationFilter.addresses = {
        some: {
          ...(filterStateId && { stateId: filterStateId }),
          ...(filterCityId && { cityId: filterCityId }),
        },
      };
    }

    const searchOr = [];
    if (search) {
      searchOr.push({
        user: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { middleName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        },
      });
      searchOr.push({ fileNo: { contains: search, mode: "insensitive" } });
      searchOr.push({
        loanType: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { label: { contains: search, mode: "insensitive" } },
          ],
        },
      });
      searchOr.push({
        twoWheelerLoan: {
          registrationNumber: { contains: search, mode: "insensitive" },
        },
      });
      searchOr.push({
        agriLoan: {
          registrationNumber: { contains: search, mode: "insensitive" },
        },
      });
      searchOr.push({
        msmeLoan: {
          registrationNumber: { contains: search, mode: "insensitive" },
        },
      });
    }

    const andConditions = [];
    if (Object.keys(userLocationFilter).length > 0) {
      andConditions.push({ user: userLocationFilter });
    }
    if (searchOr.length > 0) {
      andConditions.push({ OR: searchOr });
    }
    if (andConditions.length > 0) {
      loanWhere.AND = andConditions;
    }

    // 🔄 Build orderBy based on sortBy parameter
    let orderBy = { createdAt: "desc" };

    const validSortFields = {
      fileNo: { fileNo: sortOrder },
      userName: { user: { firstName: sortOrder } },
      totalAmount: { totalAmount: sortOrder },
      pendingAmount: { pendingAmount: sortOrder },
      createdAt: { createdAt: sortOrder },
    };

    if (sortBy && validSortFields[sortBy]) {
      orderBy = validSortFields[sortBy];
    }

    const [loans, total, totalAmount] = await Promise.all([
      prisma.loan.findMany({
        where: loanWhere,
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy,
        select: {
          id: true,
          fileNo: true,
          userId: true,
          branchId: true,
          showroomId: true,
          totalAmount: true,
          pendingAmount: true,
          isClosed: true,
          isDefaulted: true,
          fileStatus: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              phone: true,
            },
          },
          loanType: {
            select: {
              id: true,
              name: true,
              label: true,
            },
          },
          twoWheelerLoan: {
            select: {
              registrationNumber: true,
            },
          },
          agriLoan: {
            select: {
              registrationNumber: true,
            },
          },
          msmeLoan: {
            select: {
              registrationNumber: true,
            },
          },
          _count: {
            select: {
              payments: true,
            },
          },
        },
      }),
      prisma.loan.count({ where: loanWhere }),
      includeTotal === "true"
        ? prisma.loan.aggregate({
            where: loanWhere,
            _sum: {
              totalAmount: true,
            },
          })
        : Promise.resolve(null),
    ]);

    res.status(200).json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      ...(includeTotal === "true" && {
        totalAmount: totalAmount?._sum?.totalAmount || 0,
      }),
      data: loans,
    });
  } catch (err) {
    console.error("Loan List Filter Error:", err);
    res.status(500).json({ error: "Failed to fetch filtered loans" });
  }
};

exports.listLoanApprovals = async (req, res) => {
  try {
    const isAdmin = req.user.type === "ADMIN";
    const canApprove =
      isAdmin || (await checkVerifyPermission(req.user, "LOAN_APPROVE"));

    if (!canApprove) {
      return res
        .status(403)
        .json({ error: "Not allowed to view approvals", status: 403 });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const statusQuery = (req.query.status || "PENDING").toUpperCase();
    const branchId = req.query.branchId;
    const loanTypeId = req.query.loanTypeId;
    const search = (req.query.search || "").trim();

    const statusMap = {
      PENDING: PENDING_APPROVAL_STATUSES,
      APPROVED: ["ACTIVE", "DISBURSED"],
      REJECTED: ["REJECTED"],
      ALL: [
        ...new Set([
          ...PENDING_APPROVAL_STATUSES,
          "REJECTED",
          "ACTIVE",
          "DISBURSED",
        ]),
      ],
    };

    const statuses = statusMap[statusQuery] || PENDING_APPROVAL_STATUSES;

    const where = {
      fileStatus: { in: statuses },
    };

    if (branchId) {
      where.branchId = branchId;
    }
    if (loanTypeId) {
      where.loanTypeId = loanTypeId;
    }
    if (search) {
      where.OR = [
        { fileNo: { contains: search, mode: "insensitive" } },
        {
          twoWheelerLoan: {
            registrationNumber: { contains: search, mode: "insensitive" },
          },
        },
        {
          agriLoan: {
            registrationNumber: { contains: search, mode: "insensitive" },
          },
        },
        {
          msmeLoan: {
            registrationNumber: { contains: search, mode: "insensitive" },
          },
        },
        {
          user: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { middleName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        {
          employee: {
            name: { contains: search, mode: "insensitive" },
          },
        },
        {
          branch: {
            name: { contains: search, mode: "insensitive" },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: true,
          employee: true,
          branch: true,
          loanType: true,
          approvedByAdmin: true,
          approvedByEmployee: true,
        },
      }),
      prisma.loan.count({ where }),
    ]);

    return res.status(200).json({
      data,
      meta: {
        page,
        limit,
        total,
        status: statusQuery,
      },
    });
  } catch (err) {
    console.error("Loan approvals list error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch loan approvals", status: 500 });
  }
};

exports.approveLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileNo, startDate, disbursedDate } = req.body;
    const isAdmin = req.user.type === "ADMIN";
    const canApprove =
      isAdmin || (await checkVerifyPermission(req.user, "LOAN_APPROVE"));

    if (!canApprove) {
      return res
        .status(403)
        .json({ error: "Not allowed to approve loans", status: 403 });
    }

    // Validate required fields
    if (!fileNo || !fileNo.trim()) {
      return res.status(400).json({
        error: "File number is required for approval",
        status: 400,
      });
    }
    if (!startDate) {
      return res.status(400).json({
        error: "Start date is required for approval",
        status: 400,
      });
    }
    if (!disbursedDate) {
      return res.status(400).json({
        error: "Disbursed date is required for approval",
        status: 400,
      });
    }

    const loan = await prisma.loan.findUnique({
      where: { id },
      select: {
        id: true,
        fileNo: true,
        fileStatus: true,
        tenureMonths: true,
        paymentFrequency: true,
        dueDay: true,
        principalLoanAmount: true,
        interestRate: true,
      },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    if (!PENDING_APPROVAL_STATUSES.includes(loan.fileStatus)) {
      return res.status(400).json({
        error: "Loan is not pending approval",
        status: 400,
      });
    }

    // Check if fileNo is being changed and if it already exists
    if (fileNo.trim() !== loan.fileNo) {
      const existingLoan = await prisma.loan.findFirst({
        where: {
          fileNo: fileNo.trim(),
          id: { not: id },
        },
      });

      if (existingLoan) {
        return res.status(400).json({
          error: "File number already exists for another loan",
          status: 400,
        });
      }
    }

    // Parse dates and calculate dueDay from startDate (day of month)
    const parsedStartDate = parseDate(startDate);
    const parsedDisbursedDate = parseDate(disbursedDate);
    const dueDay = parsedStartDate.getDate();

    // Calculate endDate based on startDate and tenureMonths
    const endDate = addMonths(parsedStartDate, loan.tenureMonths);

    // Validate EMI is a whole number before generating schedule
    const round2Approve = (x) => Math.round(Number(x) || 0);
    const approveP = Number(loan.principalLoanAmount);
    const approveN = Number(loan.tenureMonths);
    const approveRate = Number(loan.interestRate);
    const approveFreq = (loan.paymentFrequency || "MONTHLY").toUpperCase();
    const approveFreqMonths = FREQUENCY_MONTHS[approveFreq] || 1;
    const approveTotal = round2Approve(approveP + round2Approve((approveP * approveRate * (approveN / 12)) / 100));
    const approveInstallments = Math.ceil(approveN / approveFreqMonths);
    const approveRawEMI = approveTotal / approveInstallments;
    if (!Number.isInteger(approveRawEMI) && Math.abs(approveRawEMI - Math.round(approveRawEMI)) > 0.001) {
      return res.status(400).json({
        error: `EMI amount (${approveRawEMI.toFixed(2)}) is not a whole number. The loan's interest rate or principal must be adjusted so the total (${approveTotal}) divides evenly into ${approveInstallments} installments.`,
        status: 400,
      });
    }

    // Generate EMI schedule based on approved startDate
    const emiSchedule = generateEMISchedule({
      principalLoanAmount: loan.principalLoanAmount,
      interestRate: loan.interestRate,
      tenureMonths: loan.tenureMonths,
      startDate: parsedStartDate,
      paymentFrequency: loan.paymentFrequency,
    });

    const approvedAt = new Date();
    const updated = await prisma.loan.update({
      where: { id },
      data: {
        fileStatus: "ACTIVE",
        approvalComment: null,
        approvedAt,
        approvedByAdmin: isAdmin && req.user.adminId
          ? { connect: { id: req.user.adminId } }
          : undefined,
        approvedByEmployee: !isAdmin && req.user.employeeId
          ? { connect: { id: req.user.employeeId } }
          : undefined,
        isClosed: false,
        fileNo: fileNo.trim(),
        startDate: parsedStartDate,
        dueDay,
        endDate,
        disbursedDate: parsedDisbursedDate,
      },
      include: {
        user: true,
        employee: true,
        branch: true,
        loanType: true,
      },
    });

    // Create EMI records
    await prisma.eMI.createMany({
      data: emiSchedule.map((row) => ({ ...row, loanId: id })),
    });

    await logAction({
      action: "APPROVED_LOAN",
      table: "Loan",
      targetId: id,
      metadata: {
        approvedAt,
        approverType: req.user.type,
      },
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    return res.status(200).json({
      message: "Loan approved successfully",
      data: updated,
      status: 200,
    });
  } catch (err) {
    console.error("Approve loan error:", err);
    return res
      .status(500)
      .json({ error: "Failed to approve loan", status: 500 });
  }
};

exports.rejectLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const comment = (req.body?.comment || "").trim();

    if (!comment) {
      return res.status(400).json({
        error: "Rejection comment is required",
        status: 400,
      });
    }

    const isAdmin = req.user.type === "ADMIN";
    const canApprove =
      isAdmin || (await checkVerifyPermission(req.user, "LOAN_APPROVE"));

    if (!canApprove) {
      return res
        .status(403)
        .json({ error: "Not allowed to reject loans", status: 403 });
    }

    const loan = await prisma.loan.findUnique({
      where: { id },
      select: { id: true, fileStatus: true },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    if (!PENDING_APPROVAL_STATUSES.includes(loan.fileStatus)) {
      return res.status(400).json({
        error: "Loan is not pending approval",
        status: 400,
      });
    }

    const approvedAt = new Date();
    const updated = await prisma.loan.update({
      where: { id },
      data: {
        fileStatus: "REJECTED",
        approvalComment: comment,
        approvedAt,
        approvedByAdmin: isAdmin && req.user.adminId
          ? { connect: { id: req.user.adminId } }
          : undefined,
        approvedByEmployee: !isAdmin && req.user.employeeId
          ? { connect: { id: req.user.employeeId } }
          : undefined,
        isClosed: true,
      },
      include: {
        user: true,
        employee: true,
        branch: true,
        loanType: true,
      },
    });

    await logAction({
      action: "REJECTED_LOAN",
      table: "Loan",
      targetId: id,
      metadata: {
        approvalComment: comment,
        approvedAt,
        approverType: req.user.type,
      },
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    return res.status(200).json({
      message: "Loan rejected successfully",
      data: updated,
      status: 200,
    });
  } catch (err) {
    console.error("Reject loan error:", err);
    return res
      .status(500)
      .json({ error: "Failed to reject loan", status: 500 });
  }
};

exports.listLoansDownload = async (req, res) => {
  try {
    const {
      regionId,
      stateId,
      cityId,
      isClosed,
      fromDate,
      toDate,
      includeTotal = true,
    } = req.query;

    let filterStateId = stateId;
    let filterCityId = cityId;

    // 🌍 Resolve state & city from regionId if passed
    if (regionId) {
      const region = await prisma.region.findUnique({
        where: { id: regionId },
        select: { stateId: true, cityId: true },
      });

      if (!region) {
        return res.status(404).json({ error: "Region not found" });
      }

      filterStateId = region.stateId;
      filterCityId = region.cityId;
    }

    // 🧠 Build filter
    const loanWhere = {
      ...(isClosed !== undefined && { isClosed: isClosed === "true" }),
      ...(fromDate &&
        toDate && {
          startDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
      user: {
        details: {
          ...(filterStateId && { stateId: filterStateId }),
          ...(filterCityId && { cityId: filterCityId }),
        },
      },
    };

    const [loans, total, totalAmount] = await Promise.all([
      prisma.loan.findMany({
        where: loanWhere,
        orderBy: { createdAt: "desc" },
        include: {
          user: true,
          payments: true,
          loanType: true,
          twoWheelerLoan: true,
          agriLoan: true,
          msmeLoan: true,
        },
      }),
      prisma.loan.count({ where: loanWhere }),
      prisma.loan.aggregate({
        where: loanWhere,
        _sum: {
          amount: true,
          pendingAmount: true,
        },
      }),
    ]);
    console.log(totalAmount);
    res.status(200).json({
      total,
      totalAmount: totalAmount?._sum?.amount || 0,
      data: loans,
    });
  } catch (err) {
    console.error("Loan List Filter Error:", err);
    res.status(500).json({ error: "Failed to fetch filtered loans" });
  }
};

// loans.controller.js
// assumes calculateFine(dueDate, baseAmount) is available in scope
exports.getLoanById = async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();
    const H24_MS = 24 * 60 * 60 * 1000;

    // 1) Load OPEN EMIs metadata to decide whether to update
    const openEmis = await prisma.eMI.findMany({
      where: { loanId: id, status: { in: ["UNPAID", "PARTIAL"] } },
      select: {
        id: true,
        paymentFor: true,
        emiPayAmount: true,
        amountPaidSoFar: true,
        finePaid: true,
        fineAmount: true,
        delayDays: true,
        updatedAt: true,
        status: true,
        isDelayed: true,
      },
    });

    // If there are open EMIs and last update was >= 24h ago, refresh fines
    if (openEmis.length > 0) {
      const lastUpdatedAt = openEmis[0].updatedAt;
      const needsRefresh =
        !lastUpdatedAt ||
        now.getTime() - new Date(lastUpdatedAt).getTime() >= H24_MS;

      if (needsRefresh) {
        const updates = [];

        for (const e of openEmis) {
          const emiPaidComponent = Math.max(
            Number(e.amountPaidSoFar || 0) - Number(e.finePaid || 0),
            0
          );
          // fine base = emiPayAmount - emiPaidComponent (never negative)
          const outstanding = Math.max(
            Number(e.emiPayAmount || 0) - emiPaidComponent,
            0
          );

          const storedFine = Number(e.fineAmount || 0);
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
            newFine = Math.round(Number(fineAmt) || 0);
            newDelay = Number(daysLate || 0);
            isDelayed = newDelay > 0;
          }

          // only write if changed (saves writes & keeps updatedAt meaningful)
          if (
            storedFine !== newFine ||
            storedDelay !== newDelay ||
            storedIsDelayed !== isDelayed
          ) {
            updates.push(
              prisma.eMI.update({
                where: { id: e.id },
                data: {
                  fineAmount: newFine,
                  delayDays: newDelay,
                  isDelayed,
                  // updatedAt updates automatically due to @updatedAt
                },
              })
            );
          }
        }

        if (updates.length > 0) {
          await prisma.$transaction(updates, { timeout: 20000 });
        }
      }
    }

    // 2) Fetch full loan with everything you need (fresh after any updates)
    const loan = await prisma.loan.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            addresses: { include: { city: true, state: true }, take: 1 },
          },
        },
        loanType: true,
        emi: {
          orderBy: { paymentFor: "asc" },
          include: {
            payments: {
              where: {
                status: { not: "DELETED" },
              },
            },
          },
        },
        seizedHistories: {
          orderBy: { createdAt: "desc" },
          include: {
            assignedTo: { select: { id: true, name: true } },
            seizedBy: { select: { id: true, name: true } },
            assignedByAdmin: { select: { id: true, name: true } },
            assignedByEmployee: { select: { id: true, name: true } },
            releasedByAdmin: { select: { id: true, name: true } },
            releasedByEmployee: { select: { id: true, name: true } },
          },
        },
        admin: true,
        employee: true,
        approvedByAdmin: true,
        approvedByEmployee: true,
        guarantors: true,
        payments: {
          where: {
            status: { not: "DELETED" },
          },
          include: {
            emi: true,
          },
        },
        twoWheelerLoan: { include: { brand: true, model: true } },
        agriLoan: { include: { equipment: true } },
        msmeLoan: true,
        branch: true,
      },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    return res.status(200).json({ data: loan, status: 200 });
  } catch (err) {
    console.error("Get Loan By ID Error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch loan details", status: 500 });
  }
};

/**
 * Check if a loan is eligible for manual closure
 * GET /api/loans/:id/closure-status
 * Returns whether the loan can be closed and relevant statistics
 */
exports.getLoanClosureStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const loan = await prisma.loan.findUnique({
      where: { id },
      select: {
        id: true,
        fileNo: true,
        isClosed: true,
        isForeclosed: true,
        fileStatus: true,
        pendingAmount: true,
        totalPaidAmount: true,
        totalPaidPrincipal: true,
        totalPaidInterest: true,
        totalPaidFine: true,
        principalLoanAmount: true,
        interestAmount: true,
        totalAmount: true,
      },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    // Check if all EMIs are paid
    const pendingEmis = await prisma.eMI.count({
      where: {
        loanId: id,
        status: { in: ["UNPAID", "PARTIAL", "VERIFICATION_PENDING"] }
      },
    });

    // Check for unverified payments
    const unverifiedPayments = await prisma.payment.count({
      where: {
        loanId: id,
        verified: false,
        status: { in: ["VERIFICATION_PENDING", "PENDING"] }
      }
    });

    const r2 = (n) => Math.round(Number(n) || 0);

    // Calculate if loan is eligible for closure
    const canClose =
      !loan.isClosed &&
      !loan.isForeclosed &&
      pendingEmis === 0 &&
      unverifiedPayments === 0 &&
      r2(loan.pendingAmount) <= 0;

    const closureStatus = {
      canClose,
      isClosed: loan.isClosed,
      isForeclosed: loan.isForeclosed,
      fileStatus: loan.fileStatus,
      pendingAmount: r2(loan.pendingAmount),
      pendingEmis,
      unverifiedPayments,
      statistics: {
        totalAmount: r2(loan.totalAmount),
        principalAmount: r2(loan.principalLoanAmount),
        interestAmount: r2(loan.interestAmount),
        totalPaid: r2(loan.totalPaidAmount),
        principalPaid: r2(loan.totalPaidPrincipal),
        interestPaid: r2(loan.totalPaidInterest),
        finePaid: r2(loan.totalPaidFine),
      },
      message: canClose
        ? "Loan is eligible for closure"
        : loan.isClosed
        ? "Loan is already closed"
        : loan.isForeclosed
        ? "Loan is already foreclosed"
        : pendingEmis > 0
        ? `${pendingEmis} EMI(s) still pending`
        : unverifiedPayments > 0
        ? `${unverifiedPayments} payment(s) awaiting verification`
        : r2(loan.pendingAmount) > 0
        ? `Pending amount: ₹${r2(loan.pendingAmount)}`
        : "Loan cannot be closed at this time"
    };

    return res.status(200).json({
      data: closureStatus,
      status: 200
    });

  } catch (err) {
    console.error("Get Loan Closure Status Error:", err);
    return res.status(500).json({
      error: "Failed to fetch loan closure status",
      status: 500
    });
  }
};
