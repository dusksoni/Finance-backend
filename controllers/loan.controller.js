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

exports.createLoan = async (req, res) => {
  try {
    const {
      userId,
      loanTypeId,
      amount,
      interestRate, // e.g. 10 means 10%
      startDate,
      dueDay,
      tenureMonths,
      createdBy,
      adminId,
      employeeId,
      details, // type-specific loan fields
    } = req.body;

    const parsedStart = new Date(startDate);
    const endDate = addMonths(parsedStart, tenureMonths);
    const rateDecimal = interestRate / 100;
    const t = tenureMonths / 12;

    const totalPayableAmount = Number(
      (amount * Math.pow(1 + rateDecimal, t)).toFixed(2)
    );
    const pendingAmount = totalPayableAmount;

    const loan = await prisma.loan.create({
      data: {
        userId,
        loanTypeId,
        amount,
        interestRate: rateDecimal,
        interestType: "compound-yearly",
        totalPayableAmount,
        totalPaidAmount: 0,
        pendingAmount, // ✅ Track unpaid
        startDate: parsedStart,
        endDate,
        tenureMonths,
        dueDay: dueDay || 5,
        createdBy,
        adminId,
        employeeId,
      },
    });

    // 🧩 Create type-specific details
    const loanType = await prisma.loanType.findUnique({
      where: { id: loanTypeId },
    });

    if (loanType.name === "TWOWHEELER") {
      await prisma.twoWheelerLoan.create({
        data: {
          loanId: loan.id,
          vehicleName: details.vehicleType,
          brand: details.brand,
          model: details.model,
          registrationNumber: details.registrationNumber,
          chassisNumber: details.chassisNumber,
          engineNumber: details.engineNumber,
          // dealerName: details.dealerName,
          rcNumber: details.rcNumber || "",
        },
      });
    }

    if (loanType.name === "AGRICULTURE") {
      await prisma.agricultureLoan.create({
        data: {
          loanId: loan.id,
          equipment: details.equipment,
          usageArea: details.usageArea,
          isSeasonal: details.isSeasonal || false,
        },
      });
    }

    if (loanType.name === "MSME") {
      await prisma.mSMELoan.create({
        data: {
          loanId: loan.id,
          businessName: details.businessName,
          registrationNumber: details.registrationNumber,
          businessType: details.businessType,
          monthlyRevenue: details.monthlyRevenue,
          gstNumber: details.gstNumber,
        },
      });
    }
    
    await logAction({
      action: "CREATED LOAN",
      table: "Loan",
      targetId: loan.id,
      metadata: loan,
      loginActivityId: req.user.loginActivityId,
      admin: req.user?.adminId
        ? { connect: { id: req.user.adminId } }
        : undefined,
      employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : undefined,
    });

    res.status(201).json({ message: "Loan created successfully", data: loan });
  } catch (error) {
    console.error("Create Loan Error:", error);
    res.status(500).json({ error: error.message });
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

// Make Payment
exports.makePayment = async (req, res) => {
  try {
    const {
      loanId,
      amount,
      paymentFor,
      mode,
      transactionId, // only for online
    } = req.body;

    const paidOn = new Date();
    const dueDate = new Date(paymentFor);
    const delayDays = differenceInDays(paidOn, dueDate);
    const isDelayed = delayDays > 5;
    const fineAmount =
      delayDays > 20 ? amount * 0.1 : delayDays > 5 ? amount * 0.05 : 0;

    const isOnline = mode === "ONLINE";

    const payment = await prisma.payment.create({
      data: {
        loanId,
        amount,
        paymentFor: dueDate,
        paidOn,
        isDelayed,
        delayDays: isDelayed ? delayDays : null,
        fineAmount: isDelayed ? fineAmount : null,
        mode,
        transactionId: isOnline ? transactionId : null,
        verified: isOnline, // auto-verified if online
        verifiedById: isOnline ? req.user.employeeId : null, // for online
      },
    });

    // update loan status
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });

    await prisma.loan.update({
      where: { id: loanId },
      data: {
        totalPaidAmount: loan.totalPaidAmount + amount,
        pendingAmount: loan.pendingAmount - amount,
        isDefaulted: isDelayed ? true : loan.isDefaulted,
        totalDelayDays: isDelayed
          ? loan.totalDelayDays + delayDays
          : loan.totalDelayDays,
      },
    });

    await logAction({
      action: "MADE PAYMENT",
      table: "Payment",
      targetId: payment.id,
      metadata: payment,
      loginActivityId: req.user.loginActivityId,
      admin: req.user?.adminId
        ? { connect: { id: req.user.adminId } }
        : undefined,
      employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : undefined,
    });

    res.status(201).json({ message: "Payment added", data: payment });
  } catch (error) {
    console.error("Payment Error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await prisma.payment.update({
      where: { id },
      data: {
        verified: true,
        verifiedById: req.user.employeeId,
      },
    });

    await logAction({
      action: "VERIFIED CASH PAYMENT",
      table: "Payment",
      targetId: id,
      metadata: payment,
      loginActivityId: req.user.loginActivityId,
      admin: req.user?.adminId
        ? { connect: { id: req.user.adminId } }
        : undefined,
      employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : undefined,
    });

    res.json({ message: "Payment verified", data: payment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDuePayments = async (req, res) => {
  try {
    const { userId, loanId, includeAdvance = false } = req.query;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const loans = await prisma.loan.findMany({
      where: {
        userId,
        ...(loanId && { id: loanId }),
        isClosed: false,
      },
      include: {
        payments: true,
        loanType: true,
      },
    });

    const today = new Date();
    const result = [];

    for (const loan of loans) {
      const paymentMap = new Map();
      loan.payments.forEach((p) => {
        const key = `${getYear(p.paymentFor)}-${getMonth(p.paymentFor)}`;
        paymentMap.set(key, p);
      });

      const months = [];
      for (let i = 0; i < loan.tenureMonths; i++) {
        const paymentDate = addMonths(loan.startDate, i);
        const key = `${getYear(paymentDate)}-${getMonth(paymentDate)}`;
        const existingPayment = paymentMap.get(key);

        const isCurrentMonth = isSameMonth(paymentDate, today);
        const isPast = isBefore(paymentDate, today);

        const isDue = isPast && !existingPayment;
        const isAdvance =
          includeAdvance && !isPast && !existingPayment;

        if (isDue || isCurrentMonth || isAdvance) {
          months.push({
            loanId: loan.id,
            loanType: loan.loanType.label,
            month: paymentDate.toLocaleString("default", { month: "long" }),
            year: paymentDate.getFullYear(),
            dueDate: startOfMonth(paymentDate),
            amount: loan.amount,
            status: existingPayment
              ? "PAID"
              : isPast
              ? "DUE"
              : isCurrentMonth
              ? "THIS MONTH"
              : "ADVANCE",
            fine:
              isPast && !existingPayment
                ? calculateFine(today, paymentDate, loan.amount)
                : 0,
            verified: existingPayment?.verified || false,
          });
        }
      }

      result.push({
        loanId: loan.id,
        loanType: loan.loanType.label,
        totalDue: months.filter((m) => m.status === "DUE").length,
        totalAdvance: months.filter((m) => m.status === "ADVANCE").length,
        currentMonthDue: months.find((m) => m.status === "THIS MONTH"),
        months,
      });
    }

    res.status(200).json({ data: result });
  } catch (err) {
    console.error("Get Due Payments Error:", err);
    res.status(500).json({ error: "Failed to fetch payment dues" });
  }
};

function calculateFine(today, dueDate, amount) {
  const diffDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
  if (diffDays <= 5) return 0;
  if (diffDays <= 20) return amount * 0.05;
  return amount * 0.1;
}

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
