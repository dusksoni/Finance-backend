const prisma = require("../lib/prisma");
const {
  addMonths,
  isAfter,
  differenceInDays,
  getMonth,
  getYear,
  startOfMonth,
  isBefore,
} = require("date-fns");
const logAction = require("../utils/adminLogger");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");


exports.createLoan = async (req, res) => {
  try {
    const {
      userId,
      loanTypeId,
      productAmount,
      principalLoanAmount,
      interestRate,   // percent, e.g. 10
      startDate,
      dueDay,
      tenureMonths,
      details,        // type-specific payload
      fileNo,
      disbursedDate,
      agreementDate,
      downPayment,
      interestType,
      penaltyPercentage,
      rtoCharges,
      processingCharges,
      otherCharges,
      insuranceAmount,
      insuranceDate,
      insuranceValidTill,
      insuranceAlert,
      insuranceNumber,
      insuranceCompany,
      ourPaymentType,
      comment,
      branchId,
    } = req.body;

    // Parse and compute totals
    const parsedStart = new Date(startDate);
    const endDate     = addMonths(parsedStart, tenureMonths);
    const rateDecimal = interestRate / 100;
    const years       = tenureMonths / 12;

    // Total compound interest formula: P * (1 + r)^t
    const totalAmount     = parseFloat(
      (principalLoanAmount * Math.pow(1 + rateDecimal, years)).toFixed(2)
    );
    const interestAmount  = parseFloat((totalAmount - principalLoanAmount).toFixed(2));
    const monthlyPayable  = parseFloat((totalAmount / tenureMonths).toFixed(2));
    const pendingAmount   = totalAmount;

    // Check CREATE_LOAN permission for employees
    const verified =
      req.user.type === "ADMIN" ||
      (req.user.type === "EMPLOYEE" &&
        (await checkVerifyPermission(req.user, "CREATE_LOAN")));

    // Perform all writes in one transaction (timeout extended to 30s)
    const newLoan = await prisma.$transaction(
      async (tx) => {
        // 1) Create core Loan record
        const loan = await tx.loan.create({
          data: {
            user:                { connect: { id: userId } },
            fileNo,
            loanType:            { connect: { id: loanTypeId } },
            disbursedDate:       disbursedDate ? new Date(disbursedDate) : null,
            agreementDate:       agreementDate ? new Date(agreementDate) : null,
            productAmount,
            downPayment,
            principalLoanAmount,
            interestAmount,
            totalAmount,
            monthlyPayableAmount: monthlyPayable,
            pendingAmount,
            rtoCharges,
            processingCharges,
            otherCharges,
            ourPaymentType,
            interestType,
            interestRate,
            penaltyPercentage,
            tenureMonths,
            startDate:            parsedStart,
            endDate,
            dueDay,
            fileStatus:          verified ? "ACTIVE" : "PENDING_APPROVAL",
            insuranceAmount,
            insuranceDate:       insuranceDate ? new Date(insuranceDate) : null,
            insuranceValidTill:  insuranceValidTill ? new Date(insuranceValidTill) : null,
            insuranceAlert:      insuranceAlert === "true",
            insuranceNumber,
            insuranceCompany,
            comment,
            branch:              { connect: { id: branchId } },
            createdBy:           req.user.type,
            admin:               req.user.type === "ADMIN"
                                   ? { connect: { id: req.user.adminId } }
                                   : undefined,
            employee:            req.user.type === "EMPLOYEE"
                                   ? { connect: { id: req.user.employeeId } }
                                   : undefined,
          },
        });

        // 2) Create subtype record
        const loanType = await tx.loanType.findUnique({ where: { id: loanTypeId } });
        if (loanType.name === "TWOWHEELER") {
          await tx.twoWheelerLoan.create({
            data: {
              loan:               { connect: { id: loan.id } },
              vehicleName:        details.vehicleName,
              brand:              { connect: { id: details.brandId } },
              model:              { connect: { id: details.modelId } },
              registrationNumber: details.rcNumber,
              chassisNumber:      details.chassisNumber,
              engineNumber:       details.engineNumber,
            },
          });
        } else if (loanType.name === "AGRICULTURE") {
          await tx.agricultureLoan.create({
            data: {
              loan:      { connect: { id: loan.id } },
              equipment: details.equipment,
              usageArea: details.usageArea,
              isSeasonal: details.isSeasonal ?? false,
            },
          });
        } else if (loanType.name === "MSME") {
          await tx.mSMELoan.create({
            data: {
              loan:               { connect: { id: loan.id } },
              businessName:       details.businessName,
              registrationNumber: details.registrationNumber,
              businessType:       details.businessType,
              monthlyRevenue:     details.monthlyRevenue,
              gstNumber:          details.gstNumber,
            },
          });
        }

        // 3) Create EMI schedule
        const paymentsData = Array.from({ length: tenureMonths }).map((_, i) => ({
          loanId:        loan.id,
          paymentFor:    addMonths(parsedStart, i),
          paymentDate:   addMonths(parsedStart, i),
          principalPaid: 0,
          interestPaid:  0,
          finePaid:      0,
          totalPaid:     0,
          paymentMode:   "",
          paymentStatus: "PENDING",
          status:        "UNPAID",
          isDelayed:     false,
          isForeclosure: false,
        }));
        await tx.payment.createMany({ data: paymentsData });

        // 4) Audit log
        await logAction({
          action:          "CREATED LOAN",
          table:           "Loan",
          targetId:        loan.id,
          metadata:        loan,
          loginActivityId: req.user.loginActivityId,
          admin:           req.user.adminId ? { connect: { id: req.user.adminId } } : undefined,
          employee:        req.user.employeeId ? { connect: { id: req.user.employeeId } } : undefined,
          prisma:          tx,
        });

        return loan;
      },
      {
        maxWait: 2000,   // up to 2s to acquire the transaction
        timeout: 30000,  // up to 30s for the transaction to complete
      }
    );

    return res.status(201).json({
      message: "Loan created successfully",
      data:    newLoan,
    });
  } catch (error) {
    console.error("Create Loan Error:", error);
    return res.status(500).json({ error: error.message });
  }
};



// Update Loan
exports.updateLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      loanTypeId,
      amount,
      interestRate,
      startDate,
      tenureMonths,
      dueDay,
      isClosed,
      actualEndDate,
      defaultReason,
      details,
    } = req.body;

    const existing = await prisma.loan.findUnique({
      where: { id },
      include: { loanType: true },
    });
    if (!existing) return res.status(404).json({ error: "Loan not found" });

    const newStartDate = startDate ? new Date(startDate) : existing.startDate;
    const newTenure = tenureMonths ?? existing.tenureMonths;
    const newRate =
      interestRate !== undefined ? interestRate / 100 : existing.interestRate;
    const newEndDate = addMonths(newStartDate, newTenure);

    const newTotalPayableAmount = parseFloat(
      (existing.amount * Math.pow(1 + newRate, newTenure / 12)).toFixed(2)
    );
    const newPendingAmount = newTotalPayableAmount - existing.totalPaidAmount;

    const updatedLoan = await prisma.loan.update({
      where: { id },
      data: {
        loanTypeId: loanTypeId ?? existing.loanTypeId,
        interestRate: newRate,
        startDate: newStartDate,
        endDate: newEndDate,
        tenureMonths: newTenure,
        dueDay: dueDay ?? existing.dueDay,
        isClosed: isClosed ?? existing.isClosed,
        actualEndDate: actualEndDate
          ? new Date(actualEndDate)
          : existing.actualEndDate,
        defaultReason,
        totalPayableAmount: newTotalPayableAmount,
        pendingAmount: newPendingAmount,
      },
    });

    const loanType = await prisma.loanType.findUnique({
      where: { id: loanTypeId || existing.loanTypeId },
    });

    if (loanType.name === "TWOWHEELER" && details) {
      await prisma.twoWheelerLoan.upsert({
        where: { loanId: id },
        update: { ...details },
        create: { loanId: id, ...details },
      });
    }

    if (loanType.name === "AGRICULTURE" && details) {
      await prisma.agricultureLoan.upsert({
        where: { loanId: id },
        update: { ...details },
        create: { loanId: id, ...details },
      });
    }

    if (loanType.name === "MSME" && details) {
      await prisma.mSMELoan.upsert({
        where: { loanId: id },
        update: { ...details },
        create: { loanId: id, ...details },
      });
    }

    await logAction({
      action: "UPDATED LOAN",
      table: "Loan",
      targetId: id,
      metadata: updatedLoan,
      loginActivityId: req.user.loginActivityId,
      admin: req.user?.adminId
        ? { connect: { id: req.user.adminId } }
        : undefined,
      employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : undefined,
    });

    res.json({ message: "Loan updated successfully", data: updatedLoan });
  } catch (error) {
    console.error("Update Loan Error:", error);
    res.status(500).json({ error: error.message });
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
        user: {
          include: {
            details: {
              include: {
                state: true,
                city: true,
                region: true,
              },
            },
          },
        },
        loanType: true,
        payments: true,
        twoWheelerLoan: true,
        agriLoan: true,
        msmeLoan: true,
      },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found" });
    }

    res.status(200).json({ data: loan });
  } catch (err) {
    console.error("Get Loan By ID Error:", err);
    res.status(500).json({ error: "Failed to fetch loan details" });
  }
};
