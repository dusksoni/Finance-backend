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

// ====================
// 🟢 CREATE LOAN
// ====================
exports.createLoan = async (req, res) => {
  try {
    const {
      userId,
      loanTypeId,
      productAmount,
      downPayment = 0,
      principalLoanAmount,
      interestRate, // Annual %, e.g. 14
      tenureMonths, // number of installments
      startDate, // JS date string
      dueDay = 5, // day-of-month
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

    // 1) Validate principal & tenure
    const P = Number(principalLoanAmount);
    if (!P || P <= 0) {
      return res.status(400).json({ error: "principalLoanAmount must be > 0" });
    }
    const n = parseInt(tenureMonths, 10);
    if (!n || n < 1) {
      return res.status(400).json({ error: "tenureMonths must be >= 1" });
    }

    // 2) EMI calculation (annual compounding)
    const totalPayable = P * Math.pow(1 + interestRate / 100, n / 12);
    const EMI = totalPayable / n;

    // 3) Build schedule (same frequency logic)
    const { fn: offsetFn, step } =
      FREQUENCY_OFFSETS[paymentFrequency] || FREQUENCY_OFFSETS.MONTHLY;

    let balance = P;
    const schedule = [];

    // Determine first due date
    let firstDue = setDate(new Date(startDate), dueDay);
    if (new Date(startDate).getDate() > dueDay) {
      firstDue = offsetFn(firstDue, step);
    }

    for (let i = 0; i < n; i++) {
      const dueDate = offsetFn(firstDue, step * i);
      const interestPortion = parseFloat(
        (balance * (interestRate / 100 / 12)).toFixed(2)
      );
      const principalPortion = parseFloat((EMI - interestPortion).toFixed(2));
      balance = parseFloat((balance - principalPortion).toFixed(2));

      schedule.push({
        paymentFor: dueDate,
        paymentDate: dueDate,
        emiPayAmount: EMI,
        principalAmt: principalPortion,
        interestAmt: interestPortion,
        amountPaidSoFar: 0,
        fineAmount: 0,
        status: "UNPAID",
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

    // 5) Transaction: Loan, subtypes, schedule, log
    const created = await prisma.$transaction(
      async (tx) => {
        // a) Core loan
        const loan = await tx.loan.create({
          data: {
            user: { connect: { id: userId } },
            loanType: { connect: { id: loanTypeId } },
            fileNo,
            productAmount,
            downPayment,
            principalLoanAmount,
            interestAmount: parseFloat((totalPayable - P).toFixed(2)),
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

        // b) Sub-type
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
              equipment: { connect: { id: details.equipmentId } },
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

        // c) EMI schedule
        await tx.eMI.createMany({
          data: schedule.map((row) => ({ ...row, loanId: loan.id })),
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
        maxWait: 2000,
        timeout: 30000,
      }
    );

    return res.status(201).json({ message: "Loan created", data: created });
  } catch (err) {
    console.error("Create Loan Error:", err);
    return res.status(500).json({ error: err.message });
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
      include: { payments: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Loan not found" });
    }

    // 2) new vs old
    const newPct = payload.interestRate ?? existing.interestRate;
    const newProd = payload.productAmount ?? existing.productAmount;
    const newDown = payload.downPayment ?? existing.downPayment;
    const newPrincipal = newProd - newDown;
    if (newPrincipal <= 0) {
      return res.status(400).json({ error: "Principal must be > 0" });
    }

    const newTenure = payload.tenureMonths ?? existing.tenureMonths;
    const newFreq = payload.paymentFrequency ?? existing.paymentFrequency;
    const newDueDay = payload.dueDay ?? existing.dueDay;
    const newStartDate = payload.startDate
      ? new Date(payload.startDate)
      : existing.startDate;
    const newLoanTypeId = payload.loanTypeId ?? existing.loanTypeId;

    // 3) recalc EMI & total
    const totalPayable =
      newPrincipal * Math.pow(1 + newPct / 100, newTenure / 12);
    const EMI = totalPayable / newTenure;

    // 4) schedule reset?
    const mustReset =
      existing.paymentFrequency !== newFreq ||
      existing.tenureMonths !== newTenure ||
      existing.interestRate !== newPct ||
      existing.startDate.getTime() !== newStartDate.getTime() ||
      existing.dueDay !== newDueDay;

    // 5) permissions
    const isAdmin = req.user.type === "ADMIN";
    const isEmpOk =
      req.user.type === "EMPLOYEE" &&
      (await checkVerifyPermission(req.user, "CREATE_LOAN"));
    const newFileStatus = isAdmin || isEmpOk ? "ACTIVE" : existing.fileStatus;

    // 6) frequency helpers
    const freqCfg = FREQUENCY_OFFSETS[newFreq] || FREQUENCY_OFFSETS.MONTHLY;
    const { fn: offsetFn, step } = freqCfg;

    // 7) transaction
    const updatedLoan = await prisma.$transaction(
      async (tx) => {
        // a) update loan
        const loan = await tx.loan.update({
          where: { id: loanId },
          data: {
            loanType: { connect: { id: newLoanTypeId } },
            productAmount: newProd,
            downPayment: newDown,
            principalLoanAmount: newPrincipal,
            interestAmount: parseFloat(
              (totalPayable - newPrincipal).toFixed(2)
            ),
            totalAmount: parseFloat(totalPayable.toFixed(2)),
            monthlyPayableAmount: parseFloat(EMI.toFixed(2)),
            pendingAmount: parseFloat(
              (totalPayable - existing.totalPaidAmount).toFixed(2)
            ),
            interestRate: newPct,
            tenureMonths: newTenure,
            paymentFrequency: newFreq,
            startDate: newStartDate,
            dueDay: newDueDay,
            endDate: (() => {
              let fd = setDate(newStartDate, newDueDay);
              if (newStartDate.getDate() > newDueDay) {
                fd = offsetFn(fd, step);
              }
              return offsetFn(fd, step * (newTenure - 1));
            })(),
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
            insuranceAmount:
              payload.insuranceAmount ?? existing.insuranceAmount,
            insuranceDate: payload.insuranceDate
              ? new Date(payload.insuranceDate)
              : existing.insuranceDate,
            insuranceValidTill: payload.insuranceValidTill
              ? new Date(payload.insuranceValidTill)
              : existing.insuranceValidTill,
            insuranceAlert:
              payload.insuranceAlert === undefined
                ? existing.insuranceAlert
                : payload.insuranceAlert === "true",
            insuranceNumber:
              payload.insuranceNumber ?? existing.insuranceNumber,
            insuranceCompany:
              payload.insuranceCompany ?? existing.insuranceCompany,
            comment: payload.comment ?? existing.comment,
            branch: payload.branchId
              ? { connect: { id: payload.branchId } }
              : undefined,
            fileStatus: newFileStatus,
          },
        });

        // b) reset schedule?
        if (mustReset) {
          await tx.eMI.deleteMany({ where: { loanId } });

          let bal = newPrincipal;
          const newSchedule = [];
          let firstDue = setDate(newStartDate, newDueDay);
          if (newStartDate.getDate() > newDueDay)
            firstDue = offsetFn(firstDue, step);

          for (let i = 0; i < newTenure; i++) {
            const dueDate = offsetFn(firstDue, step * i);
            const intPort = parseFloat((bal * (newPct / 100 / 12)).toFixed(2));
            const priPort = parseFloat((EMI - intPort).toFixed(2));
            bal = parseFloat((bal - priPort).toFixed(2));

            newSchedule.push({
              loanId: loan.id,
              paymentFor: dueDate,
              paymentDate: dueDate,
              emiPayAmount: parseFloat(EMI.toFixed(2)),
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
