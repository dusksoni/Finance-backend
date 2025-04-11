const prisma = require("../lib/prisma");
const { differenceInDays, startOfMonth, endOfMonth } = require("date-fns");

exports.createLoan = async (req, res) => {
  const { userId, type, amount, interestRate, startDate } = req.body;
  try {
    const loan = await prisma.loan.create({
      data: {
        userId,
        type,
        amount,
        interestRate: interestRate || 0.05,
        startDate: new Date(startDate),
        isClosed: false,
      },
    });
    res.json(loan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createTwoWheelerLoanDetails = async (req, res) => {
  const { loanId, vehicleType, brand, model, dealerName, registrationNumber } = req.body;
  try {
    const details = await prisma.twoWheelerLoan.create({
      data: { loanId, vehicleType, brand, model, dealerName, registrationNumber },
    });
    res.json(details);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createAgricultureLoanDetails = async (req, res) => {
  const { loanId, equipment } = req.body;
  try {
    const details = await prisma.agricultureLoan.create({
      data: { loanId, equipment },
    });
    res.json(details);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.listLoansByUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const loans = await prisma.loan.findMany({
      where: { userId: parseInt(userId) },
      include: {
        twoWheelerLoan: true,
        agriLoan: true,
        payments: true,
      },
    });
    res.json(loans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.makePayment = async (req, res) => {
  const { loanId, amount, paymentFor } = req.body;
  try {
    const payment = await prisma.payment.create({
      data: {
        loanId,
        amount,
        paymentFor: new Date(paymentFor),
        paidOn: new Date(),
      },
    });
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getDefaulterList = async (req, res) => {
  const { search } = req.query;
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { details: { is: { aadhaar: { contains: search } } } },
          { details: { is: { pan: { contains: search } } } },
        ],
      },
      include: {
        loans: {
          include: {
            payments: true,
          },
        },
        details: true,
      },
    });

    const defaulters = users.filter(user => {
      return user.loans.some(loan => {
        const now = new Date();
        const currentDue = startOfMonth(now);
        const hasPaid = loan.payments.some(
          p => new Date(p.paymentFor).getMonth() === now.getMonth()
        );
        return !hasPaid && !loan.isClosed;
      });
    });

    res.json(defaulters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


const { startOfMonth, isAfter, addDays, getMonth, getYear, format  } = require("date-fns");

exports.getUserMonthlyPayment = async (req, res) => {
  const { userId } = req.params;
  const now = new Date();
  const paymentForDate = startOfMonth(now);

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: {
        details: true,
        loans: {
          include: { payments: true }
        }
      }
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const result = user.loans.map(loan => {
      const hasPaid = loan.payments.find(p => 
        new Date(p.paymentFor).getMonth() === now.getMonth() &&
        new Date(p.paymentFor).getFullYear() === now.getFullYear()
      );

      let penalty = 0;
      if (!hasPaid && !loan.isClosed) {
        const today = new Date();
        const dueDate = new Date(today.getFullYear(), today.getMonth(), loan.dueDay || 5);
        const graceEnd = addDays(dueDate, 5);
        const lateAfter20 = addDays(dueDate, 20);

        if (isAfter(today, graceEnd) && isAfter(lateAfter20, today)) {
          penalty = loan.amount * 0.05;
        } else if (isAfter(today, lateAfter20)) {
          penalty = loan.amount * 0.10;
        }
      }

      return {
        loanId: loan.id,
        type: loan.type,
        amount: loan.amount,
        paid: !!hasPaid,
        paymentFor: paymentForDate,
        paidOn: hasPaid?.paidOn || null,
        penalty
      };
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        aadhaar: user.details?.aadhaar,
        pan: user.details?.pan,
        phone: user.phone,
        address: user.details?.address
      },
      monthlyPayments: result
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPendingUsers = async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        include: {
          details: true,
          loans: {
            where: { isClosed: false },
            include: { payments: true }
          }
        }
      });
  
      const now = new Date();
      const currentMonth = getMonth(now);
      const currentYear = getYear(now);
  
      const defaulters = [];
  
      for (const user of users) {
        let userHasPending = false;
        const pendingLoans = [];
  
        for (const loan of user.loans) {
          const paymentMap = new Map();
  
          for (const payment of loan.payments) {
            const key = `${getYear(payment.paymentFor)}-${getMonth(payment.paymentFor)}`;
            paymentMap.set(key, true);
          }
  
          const start = new Date(loan.startDate);
          const loanStartMonth = getMonth(start);
          const loanStartYear = getYear(start);
  
          const today = new Date();
          let month = loanStartMonth;
          let year = loanStartYear;
  
          const monthsPending = [];
  
          while (year < currentYear || (year === currentYear && month <= currentMonth)) {
            const key = `${year}-${month}`;
            if (!paymentMap.has(key)) {
              const dateForPenalty = new Date(year, month, loan.dueDay || 5);
              const graceEnd = addDays(dateForPenalty, 5);
              const lateAfter20 = addDays(dateForPenalty, 20);
              let penalty = 0;
  
              if (isAfter(today, graceEnd) && isAfter(lateAfter20, today)) {
                penalty = loan.amount * 0.10;
              } else if (isAfter(today, graceEnd)) {
                penalty = loan.amount * 0.05;
              }
  
              monthsPending.push({
                month: format(new Date(year, month, 1), "yyyy-MM"),
                penalty
              });
            }
  
            month++;
            if (month > 11) {
              month = 0;
              year++;
            }
          }
  
          if (monthsPending.length > 0) {
            userHasPending = true;
            pendingLoans.push({
              loanId: loan.id,
              type: loan.type,
              amount: loan.amount,
              pendingMonths: monthsPending
            });
          }
        }
  
        if (userHasPending) {
            let totalPendingAmount = 0;
          
            for (const loan of pendingLoans) {
              for (const month of loan.pendingMonths) {
                totalPendingAmount += loan.amount + month.penalty;
              }
            }
          
            defaulters.push({
              user: {
                id: user.id,
                name: user.name,
                aadhaar: user.details?.aadhaar,
                pan: user.details?.pan,
                phone: user.phone
              },
              pendingLoans,
              totalPendingAmount
            });
          }
          
      }
  
      res.json(defaulters);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };