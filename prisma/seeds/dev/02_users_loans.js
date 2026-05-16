// Dev seed — users, loan types, active loans with EMI schedules, payments.
// Requires 01_dev_data.js (admin/employees) to have run first.
// Safe to re-run: clears only the data it created.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ── helpers ──────────────────────────────────────────────────────────────────

const addMonths = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};

const pastDate = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(10, 0, 0, 0);
  return d;
};

// Simple EMI schedule builder (flat interest, monthly)
function buildEmiSchedule(principal, interestRate, tenureMonths, startDate, dueDay = 5) {
  const totalInterest = Math.round((principal * interestRate * tenureMonths) / (100 * 12));
  const totalAmount = Math.round(principal + totalInterest);
  const emiAmount = Math.round(totalAmount / tenureMonths);
  const emiPrincipal = Math.round(principal / tenureMonths);
  const emiInterest = Math.round(totalInterest / tenureMonths);

  const emis = [];
  for (let i = 1; i <= tenureMonths; i++) {
    const due = new Date(startDate);
    due.setMonth(due.getMonth() + i);
    due.setDate(dueDay);
    due.setHours(0, 0, 0, 0);
    // First EMI absorbs rounding difference
    const isFirst = i === 1;
    const principalAdj = isFirst ? Math.round(principal - emiPrincipal * tenureMonths) : 0;
    const interestAdj = isFirst ? Math.round(totalInterest - emiInterest * tenureMonths) : 0;
    const adj = principalAdj + interestAdj;
    emis.push({
      paymentFor: due,
      emiAmount: i === 1 ? emiAmount + adj : emiAmount,
      emiPrincipal: emiPrincipal + (isFirst ? principalAdj : 0),
      emiInterest: emiInterest + (isFirst ? interestAdj : 0),
    });
  }
  return { emis, totalInterest, totalAmount, emiAmount };
}

async function main() {
  // ── fetch seeds created by 01_dev_data.js ────────────────────────────────
  const admin = await prisma.admin.findFirst({ where: { email: "admin@finance.com" } });
  if (!admin) throw new Error("Run 01_dev_data.js first — admin not found");

  const empRajesh = await prisma.employee.findFirst({ where: { email: "rajesh.kumar@finance.com" } });
  const empPriya  = await prisma.employee.findFirst({ where: { email: "priya.sharma@finance.com" } });
  const empAmit   = await prisma.employee.findFirst({ where: { email: "amit.patel@finance.com" } });

  // ── fetch reference data ──────────────────────────────────────────────────
  const stateMP   = await prisma.state.findFirst({ where: { stateCode: "23" } }); // Madhya Pradesh
  const stateMH   = await prisma.state.findFirst({ where: { stateCode: "27" } }); // Maharashtra
  const stateGJ   = await prisma.state.findFirst({ where: { stateCode: "24" } }); // Gujarat
  const stateRJ   = await prisma.state.findFirst({ where: { stateCode: "08" } }); // Rajasthan
  const stateUP   = await prisma.state.findFirst({ where: { stateCode: "09" } }); // UP

  // ── fetch or create branches/regions (idempotent) ────────────────────────
  let regionCentral = await prisma.region.findFirst({ where: { name: "Central India Region" } });
  let regionWest    = await prisma.region.findFirst({ where: { name: "West India Region" } });
  let regionGujarat = await prisma.region.findFirst({ where: { name: "Gujarat Region" } });
  let regionNorth   = await prisma.region.findFirst({ where: { name: "North India Region" } });
  let regionUPEast  = await prisma.region.findFirst({ where: { name: "UP & East Region" } });

  // Create regions if 04_branches.js hasn't run yet
  if (!regionCentral) regionCentral = await prisma.region.create({ data: { name: "Central India Region", stateId: stateMP.id } });
  if (!regionWest)    regionWest    = await prisma.region.create({ data: { name: "West India Region",    stateId: stateMH.id } });
  if (!regionGujarat) regionGujarat = await prisma.region.create({ data: { name: "Gujarat Region",       stateId: stateGJ.id } });
  if (!regionNorth)   regionNorth   = await prisma.region.create({ data: { name: "North India Region",   stateId: stateRJ.id } });
  if (!regionUPEast)  regionUPEast  = await prisma.region.create({ data: { name: "UP & East Region",     stateId: stateUP.id } });

  const upsertBranch = async (name, regionId, extra = {}) => {
    const existing = await prisma.branch.findFirst({ where: { name, regionId } });
    if (existing) return existing;
    return prisma.branch.create({ data: { name, regionId, ...extra } });
  };
  const upsertShowroom = async (name, branchId, address) => {
    const existing = await prisma.showroom.findFirst({ where: { name, branchId } });
    if (existing) return existing;
    return prisma.showroom.create({ data: { name, branchId, address } });
  };

  const branchBhopal    = await upsertBranch("Bhopal Main Branch",  regionCentral.id, { address: "12, New Market, Bhopal, MP 462001",     pincode: 462001, phone: "07552555100", email: "bhopal.main@finance.com" });
  const branchIndore    = await upsertBranch("Indore Branch",        regionCentral.id, { address: "34, MG Road, Indore, MP 452001",          pincode: 452001, phone: "07312555200", email: "indore@finance.com"       });
  const branchMumbai    = await upsertBranch("Mumbai Main Branch",   regionWest.id,    { address: "101, Nariman Point, Mumbai, MH 400021",   pincode: 400021, phone: "02222555400", email: "mumbai.main@finance.com"   });
  const branchPune      = await upsertBranch("Pune Branch",          regionWest.id,    { address: "56, FC Road, Pune, MH 411004",            pincode: 411004, phone: "02022555500", email: "pune@finance.com"          });
  const branchAhmedabad = await upsertBranch("Ahmedabad Branch",     regionGujarat.id, { address: "22, CG Road, Ahmedabad, GJ 380006",       pincode: 380006, phone: "07922555600", email: "ahmedabad@finance.com"     });
  const branchJaipur    = await upsertBranch("Jaipur Branch",        regionNorth.id,   { address: "14, MI Road, Jaipur, RJ 302001",          pincode: 302001, phone: "01412555800", email: "jaipur@finance.com"        });
  const branchLucknow   = await upsertBranch("Lucknow Branch",       regionUPEast.id,  { address: "88, Hazratganj, Lucknow, UP 226001",      pincode: 226001, phone: "05222555900", email: "lucknow@finance.com"       });

  const showroomBhopal    = await upsertShowroom("Bhopal Auto Hub",      branchBhopal.id,    "13, New Market, Bhopal");
  const showroomIndore    = await upsertShowroom("Indore Wheels Center", branchIndore.id,    "35, MG Road, Indore");
  const showroomMumbai    = await upsertShowroom("Mumbai Motors",        branchMumbai.id,    "102, Nariman Point, Mumbai");
  const showroomPune      = await upsertShowroom("Pune Vehicle Point",   branchPune.id,      "57, FC Road, Pune");
  const showroomAhmedabad = await upsertShowroom("Ahmedabad Auto Zone",  branchAhmedabad.id, "23, CG Road, Ahmedabad");
  const showroomJaipur    = await upsertShowroom("Jaipur Auto Plaza",    branchJaipur.id,    "15, MI Road, Jaipur");
  const showroomLucknow   = await upsertShowroom("Lucknow Drive Inn",    branchLucknow.id,   "89, Hazratganj, Lucknow");
  console.log("✅ Regions, branches & showrooms ready.");

  const cityBhopal    = await prisma.city.findFirst({ where: { name: "Bhopal",  stateId: stateMP.id } });
  const cityIndore    = await prisma.city.findFirst({ where: { name: "Indore",  stateId: stateMP.id } });
  const cityMumbai    = await prisma.city.findFirst({ where: { name: "Mumbai",  stateId: stateMH.id } });
  const cityPune      = await prisma.city.findFirst({ where: { name: "Pune",    stateId: stateMH.id } });
  const cityAhmedabad = await prisma.city.findFirst({ where: { name: "Ahmedabad", stateId: stateGJ.id } });
  const cityJaipur    = await prisma.city.findFirst({ where: { name: "Jaipur",  stateId: stateRJ.id } });
  const cityLucknow   = await prisma.city.findFirst({ where: { name: "Lucknow", stateId: stateUP.id } });

  const genderMale   = await prisma.gender.findFirst({ where: { name: "Male" } });
  const genderFemale = await prisma.gender.findFirst({ where: { name: "Female" } });
  const addrPermanent = await prisma.addressCategory.findFirst({ where: { name: "Permanent" } });

  // ── clear previous test users and loans ───────────────────────────────────
  console.log("🧹 Clearing previous user/loan dev data...");
  const testEmails = [
    "ramesh.verma@test.com", "sunita.devi@test.com", "arjun.mehta@test.com",
    "kavya.nair@test.com", "mohan.lal@test.com", "pradeep.shah@test.com",
    "ananya.krishnan@test.com",
  ];
  const testUsers = await prisma.user.findMany({ where: { email: { in: testEmails } } });
  const testUserIds = testUsers.map((u) => u.id);

  if (testUserIds.length) {
    const testLoans = await prisma.loan.findMany({ where: { userId: { in: testUserIds } }, select: { id: true } });
    const testLoanIds = testLoans.map((l) => l.id);

    if (testLoanIds.length) {
      await prisma.payment.deleteMany({ where: { loanId: { in: testLoanIds } } });
      await prisma.eMI.deleteMany({ where: { loanId: { in: testLoanIds } } });
      await prisma.loan.deleteMany({ where: { id: { in: testLoanIds } } });
    }
    await prisma.userAddress.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }

  // Clear test loan types
  await prisma.loanType.deleteMany({ where: { name: { in: ["Two Wheeler Loan", "Personal Loan", "Business Loan"] } } });
  console.log("✅ Cleared.");

  // ── Loan types ────────────────────────────────────────────────────────────
  const loanTypeTW = await prisma.loanType.create({
    data: {
      name: "Two Wheeler Loan",
      label: "Two Wheeler",
      description: "Financing for two-wheelers (bikes & scooters)",
      rules: {
        minAmount: 20000, maxAmount: 200000,
        minTenureMonths: 6, maxTenureMonths: 48,
        interestRate: 14,
        penaltyPercentage: 2,
        paymentFrequency: "MONTHLY",
      },
    },
  });

  const loanTypePersonal = await prisma.loanType.create({
    data: {
      name: "Personal Loan",
      label: "Personal",
      description: "Unsecured personal loans for individuals",
      rules: {
        minAmount: 10000, maxAmount: 500000,
        minTenureMonths: 3, maxTenureMonths: 60,
        interestRate: 18,
        penaltyPercentage: 2,
        paymentFrequency: "MONTHLY",
      },
    },
  });

  const loanTypeBusiness = await prisma.loanType.create({
    data: {
      name: "Business Loan",
      label: "Business / MSME",
      description: "Working capital and term loans for small businesses",
      rules: {
        minAmount: 50000, maxAmount: 2000000,
        minTenureMonths: 6, maxTenureMonths: 84,
        interestRate: 16,
        penaltyPercentage: 3,
        paymentFrequency: "MONTHLY",
      },
    },
  });
  console.log("✅ Loan types created.");

  // ── Users ─────────────────────────────────────────────────────────────────
  const createUser = async (data) => {
    const user = await prisma.user.create({
      data: {
        firstName:    data.firstName,
        middleName:   data.middleName || "",
        lastName:     data.lastName,
        dateOfBirth:  new Date(data.dob),
        email:        data.email,
        phone:        data.phone,
        profession:   data.profession,
        creditScore:  data.creditScore,
        genderId:     data.genderId,
        adminId:      admin.id,
        employeeId:   data.employeeId,
        createdBy:    "EMPLOYEE",
      },
    });
    if (data.address) {
      await prisma.userAddress.create({
        data: {
          userId:            user.id,
          addressCategoryId: addrPermanent.id,
          address:           data.address.line,
          country:           "India",
          stateId:           data.address.stateId,
          cityId:            data.address.cityId,
          pincode:           data.address.pincode,
        },
      });
    }
    return user;
  };

  const u1 = await createUser({ firstName: "Ramesh",  lastName: "Verma",     dob: "1988-03-15", email: "ramesh.verma@test.com",     phone: "9876500001", profession: "Farmer",         creditScore: 720, genderId: genderMale.id,   employeeId: empRajesh.id, address: { line: "12 MG Road, Bhopal", stateId: stateMP.id, cityId: cityBhopal.id, pincode: 462001 } });
  const u2 = await createUser({ firstName: "Sunita",  lastName: "Devi",      dob: "1992-07-22", email: "sunita.devi@test.com",      phone: "9876500002", profession: "Homemaker",      creditScore: 680, genderId: genderFemale.id, employeeId: empPriya.id,  address: { line: "45 Sadar Bazar, Indore", stateId: stateMP.id, cityId: cityIndore.id, pincode: 452001 } });
  const u3 = await createUser({ firstName: "Arjun",   lastName: "Mehta",     dob: "1985-11-08", email: "arjun.mehta@test.com",      phone: "9876500003", profession: "Shop Owner",     creditScore: 750, genderId: genderMale.id,   employeeId: empAmit.id,   address: { line: "78 Station Road, Ahmedabad", stateId: stateGJ.id, cityId: cityAhmedabad.id, pincode: 380001 } });
  const u4 = await createUser({ firstName: "Kavya",   lastName: "Nair",      dob: "1995-04-30", email: "kavya.nair@test.com",       phone: "9876500004", profession: "Teacher",        creditScore: 800, genderId: genderFemale.id, employeeId: empPriya.id,  address: { line: "23 Powai, Mumbai", stateId: stateMH.id, cityId: cityMumbai.id, pincode: 400076 } });
  const u5 = await createUser({ firstName: "Mohan",   lastName: "Lal",       dob: "1979-09-12", email: "mohan.lal@test.com",        phone: "9876500005", profession: "Contractor",     creditScore: 610, genderId: genderMale.id,   employeeId: empRajesh.id, address: { line: "7 Lal Kothi, Jaipur", stateId: stateRJ.id, cityId: cityJaipur.id, pincode: 302015 } });
  const u6 = await createUser({ firstName: "Pradeep", lastName: "Shah",      dob: "1990-01-25", email: "pradeep.shah@test.com",     phone: "9876500006", profession: "Businessman",    creditScore: 735, genderId: genderMale.id,   employeeId: empAmit.id,   address: { line: "55 FC Road, Pune", stateId: stateMH.id, cityId: cityPune.id, pincode: 411004 } });
  const u7 = await createUser({ firstName: "Ananya",  lastName: "Krishnan",  dob: "1998-06-17", email: "ananya.krishnan@test.com",  phone: "9876500007", profession: "Software Engineer", creditScore: 810, genderId: genderFemale.id, employeeId: empRajesh.id, address: { line: "102 Gomti Nagar, Lucknow", stateId: stateUP.id, cityId: cityLucknow.id, pincode: 226010 } });
  console.log("✅ 7 users created.");

  // ── Loans ─────────────────────────────────────────────────────────────────
  // Helper: create a loan with EMI schedule and optional past payments
  const createLoan = async ({
    fileNo, user, loanType, principal, interestRate, tenureMonths, startDateDaysAgo,
    fileStatus, paidMonths = 0, employeeId, branchId, showroomId,
  }) => {
    const startDate = pastDate(startDateDaysAgo);
    const disbursedDate = new Date(startDate);
    disbursedDate.setDate(disbursedDate.getDate() + 2);

    const { emis, totalInterest, totalAmount, emiAmount } = buildEmiSchedule(
      principal, interestRate, tenureMonths, startDate
    );

    const penaltyPercentage = 2;
    const monthlyPayable = emiAmount;
    const pendingAmount  = totalAmount;

    const loan = await prisma.loan.create({
      data: {
        fileNo,
        userId:              user.id,
        adminId:             admin.id,
        employeeId:          employeeId || empRajesh.id,
        loanTypeId:          loanType.id,
        ...(branchId   ? { branchId }   : {}),
        ...(showroomId ? { showroomId } : {}),
        principalLoanAmount: principal,
        interestAmount:      totalInterest,
        totalAmount:         totalAmount,
        monthlyPayableAmount: monthlyPayable,
        pendingAmount,
        interestRate,
        interestType:        "FLAT",
        penaltyPercentage,
        tenureMonths,
        startDate,
        endDate: addMonths(startDate, tenureMonths),
        dueDay: 5,
        paymentFrequency: "MONTHLY",
        disbursedDate,
        agreementDate: startDate,
        fileStatus,
        approvedByAdminId: admin.id,
        approvedAt: startDate,
        createdBy: "EMPLOYEE",
      },
    });

    // Create EMI rows
    let totalPaidPrincipal = 0;
    let totalPaidInterest  = 0;
    let totalPaidAmount    = 0;

    for (let i = 0; i < emis.length; i++) {
      const e = emis[i];
      const isPaid = i < paidMonths;
      const emiRecord = await prisma.eMI.create({
        data: {
          loanId:         loan.id,
          paymentFor:     e.paymentFor,
          paymentDate:    e.paymentFor,
          emiPayAmount:   e.emiAmount,
          principalAmt:   e.emiPrincipal,
          interestAmt:    e.emiInterest,
          amountPaidSoFar: isPaid ? e.emiAmount : 0,
          principalPaid:  isPaid ? e.emiPrincipal : 0,
          interestPaid:   isPaid ? e.emiInterest : 0,
          totalPaid:      isPaid ? e.emiAmount : 0,
          status:         isPaid ? "PAID" : "UNPAID",
          verified:       isPaid,
          verifiedAt:     isPaid ? e.paymentFor : null,
          verifiedByAdminId: isPaid ? admin.id : null,
        },
      });

      if (isPaid) {
        // Create a payment record for paid EMIs
        const payDate = new Date(e.paymentFor);
        payDate.setDate(payDate.getDate() - 1); // paid a day before due

        await prisma.payment.create({
          data: {
            loanId:     loan.id,
            emiId:      emiRecord.id,
            amount:     e.emiAmount,
            paymentDate: payDate,
            paymentMode: i % 2 === 0 ? "UPI" : "CASH",
            transactionId: `TXN${Date.now()}${i}`,
            status:     "PAID",
            verified:   true,
            verifiedAt: payDate,
            verifiedByAdminId: admin.id,
            adminId:    admin.id,
            employeeId: employeeId || empRajesh.id,
          },
        });

        totalPaidPrincipal += e.emiPrincipal;
        totalPaidInterest  += e.emiInterest;
        totalPaidAmount    += e.emiAmount;
      }
    }

    // Update loan totals
    const newPending = Math.round(totalAmount - totalPaidAmount);
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        totalPaidPrincipal: Math.round(totalPaidPrincipal),
        totalPaidInterest:  Math.round(totalPaidInterest),
        totalPaidAmount:    Math.round(totalPaidAmount),
        pendingAmount:      newPending,
      },
    });

    return loan;
  };

  // 1. Ramesh Verma — Active TW loan, 4 EMIs paid out of 24
  const loan1 = await createLoan({
    fileNo: "LN-2025-001", user: u1, loanType: loanTypeTW,
    principal: 85000, interestRate: 14, tenureMonths: 24, startDateDaysAgo: 150,
    fileStatus: "ACTIVE", paidMonths: 4, employeeId: empRajesh.id,
    branchId: branchBhopal.id, showroomId: showroomBhopal.id,
  });

  // 2. Sunita Devi — Active Personal loan, 2 EMIs paid out of 12
  const loan2 = await createLoan({
    fileNo: "LN-2025-002", user: u2, loanType: loanTypePersonal,
    principal: 50000, interestRate: 18, tenureMonths: 12, startDateDaysAgo: 75,
    fileStatus: "ACTIVE", paidMonths: 2, employeeId: empPriya.id,
    branchId: branchIndore.id, showroomId: showroomIndore.id,
  });

  // 3. Arjun Mehta — Business loan, 7 paid out of 36 (healthy)
  const loan3 = await createLoan({
    fileNo: "LN-2024-088", user: u3, loanType: loanTypeBusiness,
    principal: 300000, interestRate: 16, tenureMonths: 36, startDateDaysAgo: 240,
    fileStatus: "ACTIVE", paidMonths: 7, employeeId: empAmit.id,
    branchId: branchAhmedabad.id, showroomId: showroomAhmedabad.id,
  });

  // 4. Kavya Nair — Personal loan, fully new (just disbursed, 0 EMIs paid)
  const loan4 = await createLoan({
    fileNo: "LN-2025-007", user: u4, loanType: loanTypePersonal,
    principal: 250000, interestRate: 18, tenureMonths: 24, startDateDaysAgo: 10,
    fileStatus: "ACTIVE", paidMonths: 0, employeeId: empPriya.id,
    branchId: branchMumbai.id, showroomId: showroomMumbai.id,
  });

  // 5. Mohan Lal — OVERDUE TW loan — started 8 months ago, only 5 paid, now overdue
  const loan5 = await createLoan({
    fileNo: "LN-2024-055", user: u5, loanType: loanTypeTW,
    principal: 65000, interestRate: 14, tenureMonths: 24, startDateDaysAgo: 240,
    fileStatus: "OVERDUE", paidMonths: 5, employeeId: empRajesh.id,
    branchId: branchJaipur.id, showroomId: showroomJaipur.id,
  });
  // Mark a couple EMIs as delayed
  await prisma.eMI.updateMany({
    where: { loanId: loan5.id, status: "UNPAID" },
    data: { isDelayed: true, delayDays: 45, fineAmount: 650 },
  });

  // 6. Pradeep Shah — CLOSED loan — 12/12 paid
  const loan6 = await createLoan({
    fileNo: "LN-2024-091", user: u6, loanType: loanTypeTW,
    principal: 70000, interestRate: 14, tenureMonths: 12, startDateDaysAgo: 400,
    fileStatus: "CLOSED", paidMonths: 12, employeeId: empAmit.id,
    branchId: branchPune.id, showroomId: showroomPune.id,
  });
  await prisma.loan.update({
    where: { id: loan6.id },
    data: { isClosed: true, pendingAmount: 0 },
  });

  // 7. Ananya Krishnan — PENDING APPROVAL (not yet disbursed)
  const loan7 = await createLoan({
    fileNo: "LN-2025-012", user: u7, loanType: loanTypePersonal,
    principal: 100000, interestRate: 18, tenureMonths: 18, startDateDaysAgo: 5,
    fileStatus: "PENDING_APPROVAL", paidMonths: 0, employeeId: empRajesh.id,
    branchId: branchLucknow.id, showroomId: showroomLucknow.id,
  });
  await prisma.loan.update({
    where: { id: loan7.id },
    data: { disbursedDate: null, approvedAt: null, approvedByAdminId: null },
  });

  console.log("✅ 7 loans created with EMI schedules and payment history.");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n========================================");
  console.log("🎉 USER & LOAN SEED COMPLETE");
  console.log("========================================");
  console.log("👥 USERS (password not applicable — employee-created)");
  console.log("   ramesh.verma@test.com     — Active TW Loan   LN-2025-001 (4/24 paid)");
  console.log("   sunita.devi@test.com      — Active Personal   LN-2025-002 (2/12 paid)");
  console.log("   arjun.mehta@test.com      — Active Business   LN-2024-088 (7/36 paid)");
  console.log("   kavya.nair@test.com       — Active Personal   LN-2025-007 (new, 0 paid)");
  console.log("   mohan.lal@test.com        — OVERDUE TW        LN-2024-055 (5/24, delayed)");
  console.log("   pradeep.shah@test.com     — CLOSED TW         LN-2024-091 (12/12 paid)");
  console.log("   ananya.krishnan@test.com  — Pending Approval  LN-2025-012");
  console.log("========================================");
  console.log("📋 LOAN TYPES: Two Wheeler, Personal, Business");
  console.log("========================================\n");
}

main()
  .catch((e) => { console.error("❌ User/loan seed failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
