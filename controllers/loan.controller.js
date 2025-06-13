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

const FREQUENCY_OFFSETS = {
  MONTHLY: { fn: addMonths, step: 1 },
  QUARTERLY: { fn: addMonths, step: 3 },
  HALF_YEARLY: { fn: addMonths, step: 6 },
  YEARLY: { fn: addYears, step: 1 },
};

exports.createLoan = async (req, res) => {
  try {
    const {
      userId,
      loanTypeId,
      productAmount,
      downPayment = 0,
      principalLoanAmount,
      interestRate, // Annual % (e.g. 14)
      tenureMonths, // Total number of installments
      startDate, // JS date string
      dueDay = 5, // Day-of-month on which payments fall
      paymentFrequency = "MONTHLY",
      details, // subtype payload
      fileNo,
      disbursedDate,
      agreementDate,
      rtoCharges,
      processingCharges,
      otherCharges,
      ourPaymentType,
      insuranceAmount,
      insuranceDate,
      insuranceValidTill,
      insuranceAlert,
      insuranceNumber,
      insuranceCompany,
      comment,
      branchId,
      interestType,
      penaltyPercentage,
    } = req.body;

    // 1) Check principal
    const P = Number(principalLoanAmount);
    if (!P || P <= 0) {
      return res.status(400).json({
        error: "principalLoanAmount must be more than 0",
        status: 400,
      });
    }
    const n = parseInt(tenureMonths, 10);
    if (!n || n < 1) {
      return res
        .status(400)
        .json({ error: "Months will be more than 0", status: 400 });
    }

    // 2) Compute monthly EMI using amortization formula
    const totalPayable = P * Math.pow(1 + interestRate / 100, n / 12);
    const EMI = totalPayable / n;

    // 3) Build amortization schedule
    const { fn: offsetFn, step } =
      FREQUENCY_OFFSETS[paymentFrequency] || FREQUENCY_OFFSETS.MONTHLY;

    let balance = P;
    const schedule = [];

    // first installment date: shift startDate by one frequency increment, then set day-of-month
    let firstDue = setDate(new Date(startDate), dueDay);
    if (new Date(startDate).getDate() > dueDay) {
      // Move forward one frequency interval
      firstDue = offsetFn(firstDue, step);
    }

    for (let i = 0; i < n; i++) {
      const dueDate = offsetFn(firstDue, step * i);

      // interest portion on current balance
      const interestPortion = parseFloat(
        (balance * (interestRate / 100 / 12)).toFixed(2)
      );
      // principal portion = EMI minus interest
      const principalPortion = parseFloat((EMI - interestPortion).toFixed(2));
      // reduce remaining balance
      balance = parseFloat((balance - principalPortion).toFixed(2));

      schedule.push({
        paymentFor: dueDate,
        paymentDate: dueDate,
        emiPayAmount: EMI,
        principalAmt: principalPortion,
        interestAmt: interestPortion,
        amountPaidSoFar: 0,
        fineAmount: 0,
        status: "UNPAID", // UNPAID | PARTIAL | PAID
        paymentStatus: "PENDING", // PENDING | APPROVED
        isDelayed: false,
        isForeclosure: false,
      });
    }

    // 4) Permission check
    const isAdmin = req.user.type === "ADMIN";
    const isEmpCan =
      req.user.type === "EMPLOYEE" &&
      (await checkVerifyPermission(req.user, "CREATE_LOAN"));
    const verified = isAdmin || isEmpCan;

    // 5) Persist everything in one transaction
    const created = await prisma.$transaction(
      async (tx) => {
        // a) Create core Loan
        const loan = await tx.loan.create({
          data: {
            user: { connect: { id: userId } },
            fileNo,
            loanType: { connect: { id: loanTypeId } },
            productAmount,
            downPayment,
            principalLoanAmount,
            interestAmount: parseFloat(
              (totalPayable - principalLoanAmount).toFixed(2)
            ),
            totalAmount: totalPayable,
            monthlyPayableAmount: EMI,
            pendingAmount: totalPayable,
            interestRate,
            interestType,
            penaltyPercentage,
            tenureMonths: n,
            paymentFrequency,
            rtoCharges,
            processingCharges,
            otherCharges,
            ourPaymentType,
            startDate: new Date(startDate),
            endDate: schedule[n - 1].paymentFor,
            dueDay,
            fileStatus: verified ? "ACTIVE" : "PENDING_APPROVAL",
            disbursedDate: disbursedDate ? new Date(disbursedDate) : null,
            agreementDate: agreementDate ? new Date(agreementDate) : null,
            insuranceAmount,
            insuranceDate: insuranceDate ? new Date(insuranceDate) : null,
            insuranceValidTill: insuranceValidTill
              ? new Date(insuranceValidTill)
              : null,
            insuranceAlert: insuranceAlert === "true",
            insuranceNumber,
            insuranceCompany,
            comment,
            branch: { connect: { id: branchId } },
            createdBy: req.user.type,
            admin: isAdmin ? { connect: { id: req.user.adminId } } : undefined,
            employee: !isAdmin
              ? { connect: { id: req.user.employeeId } }
              : undefined,
          },
        });

        // b) Sub-type record
        const lt = await tx.loanType.findUnique({ where: { id: loanTypeId } });
        if (lt.name === "TWOWHEELER") {
          await tx.twoWheelerLoan.create({
            data: {
              loan: { connect: { id: loan.id } },
              vehicleName: details.vehicleName,
              brand: { connect: { id: details.brandId } },
              model: { connect: { id: details.modelId } },
              registrationNumber: details.registrationNumber,
              chassisNumber: details.chassisNumber,
              engineNumber: details.engineNumber,
            },
          });
        } else if (lt.name === "AGRICULTURE") {
          await tx.agricultureLoan.create({
            data: {
              loan: { connect: { id: loan.id } },
              equipment: details.equipment,
              usageArea: details.usageArea,
              isSeasonal: details.isSeasonal || false,
            },
          });
        } else if (lt.name === "MSME") {
          await tx.mSMELoan.create({
            data: {
              loan: { connect: { id: loan.id } },
              businessName: details.businessName,
              registrationNumber: details.registrationNumber,
              businessType: details.businessType,
              monthlyRevenue: details.monthlyRevenue,
              gstNumber: details.gstNumber,
            },
          });
        }

        // c) Bulk-insert schedule into Payment table
        await tx.payment.createMany({
          data: schedule.map((row) => ({
            ...row,
            loanId: loan.id,
          })),
        });

        // d) Audit log
        await logAction({
          action: "CREATED_LOAN",
          table: "Loan",
          targetId: loan.id,
          metadata: loan,
          loginActivityId: req.user.loginActivityId,
          admin: isAdmin ? { connect: { id: req.user.adminId } } : undefined,
          employee: !isAdmin
            ? { connect: { id: req.user.employeeId } }
            : undefined,
          prisma: tx,
        });

        return loan;
      },
      {
        maxWait: 2000, // wait up to 2s for the TX lock
        timeout: 30000, // allow up to 30s for the entire TX
      }
    );

    // 6) Return success
    return res.status(201).json({
      message: "Loan created successfully",
      data: created,
      status: 201,
    });
  } catch (err) {
    console.error("Create Loan Error:", err);
    return res.status(500).json({
      error: err.message,
      status: 500,
    });
  }
};

// ------------- updateLoan -------------
exports.updateLoan = async (req, res) => {
  try {
    const loanId = req.params.id;
    const payload = req.body;

    // Fetch existing (incl schedule + subtype)
    const existing = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        loanType: true,
        payments: true,
        twoWheelerLoan: true,
        agriLoan: true,
        msmeLoan: true,
      },
    });
    if (!existing) {
      return res.status(404).json({ error: "Loan not found" });
    }

    // Pull or default fields
    const newAnnualPct =
      payload.interestRate !== undefined
        ? payload.interestRate
        : existing.interestRate;
    const newProductAmt = payload.productAmount ?? existing.productAmount;
    const newDownPay = payload.downPayment ?? existing.downPayment;
    const newPrincipal = newProductAmt - newDownPay;
    if (newPrincipal <= 0) {
      return res
        .status(400)
        .json({ error: "Principal must be > 0 (productAmount-downPayment>" });
    }

    const newTenure = payload.tenureMonths ?? existing.tenureMonths;
    const newFreq = payload.paymentFrequency || existing.paymentFrequency;
    const newDueDay = payload.dueDay ?? existing.dueDay;
    const newStartDate = payload.startDate
      ? new Date(payload.startDate)
      : existing.startDate;
    const newLoanTypeId = payload.loanTypeId ?? existing.loanTypeId;

    // compute EMI & schedule params
    const rMonth = newAnnualPct / 100 / 12;
    const n = newTenure;
    const P = newPrincipal;
    let newEMI, factor;
    if (rMonth > 0) {
      factor = Math.pow(1 + rMonth, n);
      newEMI = parseFloat(((P * rMonth * factor) / (factor - 1)).toFixed(2));
    } else {
      newEMI = parseFloat((P / n).toFixed(2));
    }
    const newTotalAmt = parseFloat((newEMI * n).toFixed(2));
    const newInterestAmt = parseFloat((newTotalAmt - P).toFixed(2));
    const newPendingAmount = parseFloat(
      (newTotalAmt - existing.totalPaidAmount).toFixed(2)
    );

    // schedule reschedule flag
    const freqCfg = FREQUENCY_OFFSETS[newFreq] || FREQUENCY_OFFSETS.MONTHLY;
    const mustReschedule =
      existing.paymentFrequency !== newFreq ||
      existing.tenureMonths !== newTenure ||
      existing.interestRate !== newAnnualPct ||
      existing.startDate.getTime() !== newStartDate.getTime() ||
      existing.dueDay !== newDueDay;

    // permission
    const isAdmin = req.user.type === "ADMIN";
    const isEmpOk =
      req.user.type === "EMPLOYEE" &&
      (await checkVerifyPermission(req.user, "CREATE_LOAN"));
    const verified = isAdmin || isEmpOk;

    // run tx
    const updatedLoan = await prisma.$transaction(async (tx) => {
      // 1) update Loan
      const loan = await tx.loan.update({
        where: { id: loanId },
        data: {
          loanType: { connect: { id: newLoanTypeId } },
          productAmount: newProductAmt,
          downPayment: newDownPay,
          principalLoanAmount: P,
          interestAmount: newInterestAmt,
          totalAmount: newTotalAmt,
          monthlyPayableAmount: newEMI,
          pendingAmount: newPendingAmount,
          interestRate: newAnnualPct,
          tenureMonths: newTenure,
          paymentFrequency: newFreq,
          startDate: newStartDate,
          dueDay: newDueDay,
          endDate: setDate(offsetFn(newStartDate, freqCfg.step * n), newDueDay),
          fileNo: payload.fileNo ?? existing.fileNo,
          disbursedDate: payload.disbursedDate
            ? new Date(payload.disbursedDate)
            : existing.disbursedDate,
          agreementDate: payload.agreementDate
            ? new Date(payload.agreementDate)
            : existing.agreementDate,
          rtoCharges: payload.rtoCharges ?? existing.rtoCharges,
          processingCharges:
            payload.processingCharges ?? existing.processingCharges,
          otherCharges: payload.otherCharges ?? existing.otherCharges,
          ourPaymentType: payload.ourPaymentType ?? existing.ourPaymentType,
          insuranceAmount: payload.insuranceAmount ?? existing.insuranceAmount,
          insuranceDate: payload.insuranceDate
            ? new Date(payload.insuranceDate)
            : existing.insuranceDate,
          insuranceValidTill: payload.insuranceValidTill
            ? new Date(payload.insuranceValidTill)
            : existing.insuranceValidTill,
          insuranceAlert:
            payload.insuranceAlert !== undefined
              ? payload.insuranceAlert === "true"
              : existing.insuranceAlert,
          insuranceNumber: payload.insuranceNumber ?? existing.insuranceNumber,
          insuranceCompany:
            payload.insuranceCompany ?? existing.insuranceCompany,
          comment: payload.comment ?? existing.comment,
          branch: payload.branchId
            ? { connect: { id: payload.branchId } }
            : undefined,
          isClosed: payload.isClosed ?? existing.isClosed,
          actualEndDate: payload.actualEndDate
            ? new Date(payload.actualEndDate)
            : existing.actualEndDate,
          defaultReason: payload.defaultReason ?? existing.defaultReason,

          fileStatus: verified ? "ACTIVE" : existing.fileStatus,
        },
      });

      // 2) Payments reset
      if (mustReschedule) {
        await tx.payment.deleteMany({ where: { loanId: loan.id } });

        // rebuild schedule
        let bal = P;
        const sch = [];
        const fn = freqCfg.fn;
        const stp = freqCfg.step;
        let firstDue = setDate(fn(newStartDate, stp), newDueDay);

        for (let i = 0; i < n; i++) {
          const dt = fn(firstDue, stp * i);
          const intC = parseFloat((bal * rMonth).toFixed(2));
          const prC = parseFloat((newEMI - intC).toFixed(2));
          bal = parseFloat((bal - prC).toFixed(2));

          sch.push({
            loanId: loan.id,
            paymentFor: dt,
            paymentDate: dt,
            emiPayAmount: newEMI,
            principalAmt: prC,
            interestAmt: intC,
            amountPaidSoFar: 0,
            fineAmount: 0,
            status: "UNPAID",
            paymentStatus: "PENDING",
            isDelayed: false,
            isForeclosure: false,
          });
        }
        await tx.payment.createMany({ data: sch });
      }

      // 3) upsert subtype (same logic)

      const lt = await tx.loanType.findUnique({ where: { id: newLoanTypeId } });
      if (lt.name === "TWOWHEELER" && payload.details) {
        await tx.twoWheelerLoan.upsert({
          where: { loanId: loan.id },
          create: {
            loan: { connect: { id: loan.id } },
            vehicleName: payload.details.vehicleName,
            brand: { connect: { id: payload.details.brandId } },
            model: { connect: { id: payload.details.modelId } },
            registrationNumber: payload.details.rcNumber,
            chassisNumber: payload.details.chassisNumber,
            engineNumber: payload.details.engineNumber,
          },
          update: {
            vehicleName: payload.details.vehicleName,
            brand: { connect: { id: payload.details.brandId } },
            model: { connect: { id: payload.details.modelId } },
            registrationNumber: payload.details.rcNumber,
            chassisNumber: payload.details.chassisNumber,
            engineNumber: payload.details.engineNumber,
          },
        });
      } else if (lt.name === "AGRICULTURE" && payload.details) {
        await tx.agricultureLoan.upsert({
          where: { loanId: loan.id },
          create: { loanId: loan.id, ...payload.details },
          update: { ...payload.details },
        });
      } else if (lt.name === "MSME" && payload.details) {
        await tx.mSMELoan.upsert({
          where: { loanId: loan.id },
          create: { loanId: loan.id, ...payload.details },
          update: { ...payload.details },
        });
      }

      // 4) Audit
      await logAction({
        action: "UPDATED_LOAN",
        table: "Loan",
        targetId: loan.id,
        metadata: loan,
        loginActivityId: req.user.loginActivityId,
        admin: req.user.adminId
          ? { connect: { id: req.user.adminId } }
          : undefined,
        employee: req.user.employeeId
          ? { connect: { id: req.user.employeeId } }
          : undefined,
        prisma: tx,
      });

      return loan;
    });

    return res.json({
      message: "Loan updated successfully",
      data: updatedLoan,
    });
  } catch (err) {
    console.error("Update Loan Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// List Loans by User
exports.listLoansByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const loans = await prisma.loan.findMany({
      where: { userId },
      include: {
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
    const loan = await prisma.loan.update({
      where: { id },
      data: { isClosed: true, actualEndDate: new Date() },
    });
    await logAction({
      action: "CLOSED LOAN",
      table: "Loan",
      targetId: id,
      metadata: loan,
      loginActivityId: req.user.loginActivityId,
      admin: req.user?.adminId
        ? { connect: { id: req.user.adminId } }
        : undefined,
      employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : undefined,
    });
    res.json({ message: "Loan closed", data: loan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPendingLoanDetails = async (req, res) => {
  try {
    const now = new Date();
    const users = await prisma.user.findMany({
      include: {
        loans: {
          where: { isClosed: false },
          include: { payments: true },
        },
      },
    });

    const result = [];

    for (const user of users) {
      for (const loan of user.loans) {
        const start = new Date(loan.startDate);
        const tenure = loan.tenureMonths;
        const paymentMap = new Map();

        // Map all paid months
        for (const p of loan.payments) {
          const key = `${getYear(p.paymentFor)}-${getMonth(p.paymentFor)}`;
          paymentMap.set(key, true);
        }

        // Calculate all due months
        let pendingMonths = [];
        for (let i = 0; i < tenure; i++) {
          const due = addMonths(start, i);
          if (isBefore(due, now)) {
            const key = `${getYear(due)}-${getMonth(due)}`;
            if (!paymentMap.has(key)) {
              pendingMonths.push({
                month: `${due.getFullYear()}-${String(
                  due.getMonth() + 1
                ).padStart(2, "0")}`,
                amount: loan.amount,
              });
            }
          }
        }

        if (pendingMonths.length > 0) {
          result.push({
            userId: user.id,
            userName: user.name,
            loanId: loan.id,
            type: loan.type,
            amountPerMonth: loan.amount,
            pendingCount: pendingMonths.length,
            totalPendingAmount: pendingMonths.reduce(
              (acc, m) => acc + m.amount,
              0
            ),
            pendingMonths,
          });
        }
      }
    }

    res.status(200).json({ data: result });
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
      isClosed,
      search,
      fromDate,
      toDate,
      includeTotal = false,
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
      ...(fromDate &&
        toDate && {
          startDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
      user: {
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        }),
        details: {
          ...(filterStateId && { stateId: filterStateId }),
          ...(filterCityId && { cityId: filterCityId }),
        },
      },
    };

    const [loans, total, totalAmount] = await Promise.all([
      prisma.loan.findMany({
        where: loanWhere,
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            include: {
              details: true,
            },
          },
          payments: true,
          loanType: true,
          twoWheelerLoan: true,
          agriLoan: true,
          msmeLoan: true,
        },
      }),
      prisma.loan.count({ where: loanWhere }),
      includeTotal === "true"
        ? prisma.loan.aggregate({
            where: loanWhere,
            _sum: {
              amount: true,
            },
          })
        : Promise.resolve(null),
    ]);

    res.status(200).json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      ...(includeTotal === "true" && {
        totalAmount: totalAmount?._sum?.amount || 0,
      }),
      data: loans,
    });
  } catch (err) {
    console.error("Loan List Filter Error:", err);
    res.status(500).json({ error: "Failed to fetch filtered loans" });
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

exports.getLoanById = async (req, res) => {
  try {
    const { id } = req.params;

    const loan = await prisma.loan.findUnique({
      where: { id },
      include: {
        user: true,
        loanType: true,
        payments: true,
        twoWheelerLoan: {
          include: {
            brand: true,
            model: true,
          },
        },
        agriLoan: {
          include: {
            equipment: true,
          },
        },
        msmeLoan: true,

        branch: true,
      },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    res.status(200).json({ data: loan, status: 200 });
  } catch (err) {
    console.error("Get Loan By ID Error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch loan details", status: 500 });
  }
};
