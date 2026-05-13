const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const companyName = process.env.COMPANY_NAME?.toLowerCase() || "example";
  const hashedPassword = await bcrypt.hash("Admin@1234", 10);
  const employeePassword = await bcrypt.hash("Employee@1234", 10);

  // ============================================================
  // 🧹 CLEAR EXISTING DEMO DATA (keep reference data)
  // ============================================================
  console.log("🧹 Clearing existing demo data...");

  await prisma.payment.deleteMany({});
  await prisma.eMI.deleteMany({});
  await prisma.loanGuarantor.deleteMany({});
  await prisma.twoWheelerLoan.deleteMany({});
  await prisma.agricultureLoan.deleteMany({});
  await prisma.mSMELoan.deleteMany({});
  await prisma.forecloseRequest.deleteMany({});
  await prisma.paymentOrder.deleteMany({});
  await prisma.pendingUPITransaction.deleteMany({});
  await prisma.seizedContactAttempt.deleteMany({});
  await prisma.seizedHistory.deleteMany({});
  await prisma.terminationRequest.deleteMany({});
  await prisma.loanApplicationDraft.deleteMany({});
  await prisma.userApplicationDraft.deleteMany({});
  await prisma.loan.deleteMany({});
  await prisma.userGuarantor.deleteMany({});
  await prisma.userUpdateRequest.deleteMany({});
  await prisma.userAddress.deleteMany({});
  await prisma.photoID.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.actionLog.deleteMany({});
  await prisma.loginActivity.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.admin.deleteMany({});
  await prisma.showroom.deleteMany({});
  await prisma.branch.deleteMany({});
  await prisma.region.deleteMany({});
  await prisma.city.deleteMany({});
  await prisma.vehicleVariant.deleteMany({});
  await prisma.vehicleModel.deleteMany({});
  await prisma.vehicleBrand.deleteMany({});
  await prisma.equipment.deleteMany({});

  console.log("✅ Existing demo data cleared.");

  // ============================================================
  // 📍 REFERENCE DATA (Genders, States, etc.)
  // ============================================================

  const genders = [
    { name: "Female", value: "01" },
    { name: "Male", value: "02" },
    { name: "Other", value: "03" },
  ];
  await Promise.all(
    genders.map((gender) =>
      prisma.gender.upsert({
        where: { name: gender.name },
        update: { value: gender.value },
        create: gender,
      })
    )
  );

  const addressCategories = [
    { name: "Permanent", value: "01" },
    { name: "Official", value: "02" },
  ];
  await Promise.all(
    addressCategories.map((cat) =>
      prisma.addressCategory.upsert({
        where: { name: cat.name },
        update: { value: cat.value },
        create: cat,
      })
    )
  );

  const states = [
    { name: "JAMMU AND KASHMIR", stateCode: "01" },
    { name: "HIMACHAL PRADESH", stateCode: "02" },
    { name: "PUNJAB", stateCode: "03" },
    { name: "CHANDIGARH", stateCode: "04" },
    { name: "UTTARAKHAND", stateCode: "05" },
    { name: "HARYANA", stateCode: "06" },
    { name: "DELHI", stateCode: "07" },
    { name: "RAJASTHAN", stateCode: "08" },
    { name: "UTTAR PRADESH", stateCode: "09" },
    { name: "BIHAR", stateCode: "10" },
    { name: "SIKKIM", stateCode: "11" },
    { name: "ARUNACHAL PRADESH", stateCode: "12" },
    { name: "NAGALAND", stateCode: "13" },
    { name: "MANIPUR", stateCode: "14" },
    { name: "MIZORAM", stateCode: "15" },
    { name: "TRIPURA", stateCode: "16" },
    { name: "MEGHALAYA", stateCode: "17" },
    { name: "ASSAM", stateCode: "18" },
    { name: "WEST BENGAL", stateCode: "19" },
    { name: "JHARKHAND", stateCode: "20" },
    { name: "ORISSA", stateCode: "21" },
    { name: "CHHATTISGARH", stateCode: "22" },
    { name: "MADHYA PRADESH", stateCode: "23" },
    { name: "GUJARAT", stateCode: "24" },
    { name: "DAMAN AND DIU", stateCode: "25" },
    { name: "DADAR AND NAGAR HAVELI", stateCode: "26" },
    { name: "MAHARASTRA", stateCode: "27" },
    { name: "KARNATAKA", stateCode: "29" },
    { name: "GOA", stateCode: "30" },
    { name: "LAKSHADWEEP", stateCode: "31" },
    { name: "KERALA", stateCode: "32" },
    { name: "TAMIL NADU", stateCode: "33" },
    { name: "PUDUCHERRY", stateCode: "34" },
    { name: "ANDAMAN AND NICOBAR", stateCode: "35" },
    { name: "TELANGANA", stateCode: "36" },
    { name: "ANDHRA PRADESH", stateCode: "37" },
    { name: "OTHER TERRITORY", stateCode: "97" },
    { name: "OTHER COUNTRY", stateCode: "96" },
  ];
  await Promise.all(
    states.map((state) =>
      prisma.state.upsert({
        where: { name: state.name },
        update: { stateCode: state.stateCode },
        create: state,
      })
    )
  );

  const photoIdTypes = [
    {
      name: "AADHAAR",
      description: "12-digit unique identity number",
      minLength: 12,
      maxLength: 12,
      numberTypeEg: "123412341234",
      validation: "^[0-9]{12}$",
    },
    {
      name: "PAN",
      description: "Permanent Account Number (PAN) card",
      minLength: 10,
      maxLength: 10,
      numberTypeEg: "ABCDE1234F",
      validation: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$",
    },
    {
      name: "DRIVING_LICENSE",
      description: "Driving License number in India",
      minLength: 10,
      maxLength: 20,
      numberTypeEg: "MH12 20110001234",
      validation: "^[A-Z]{2}[0-9]{2}s?[0-9]{11}$",
    },
    {
      name: "PASSPORT",
      description: "Indian Passport number (1 letter followed by 7 digits)",
      minLength: 8,
      maxLength: 8,
      numberTypeEg: "Z1234567",
      validation: "^[A-Z][0-9]{7}$",
    },
  ];
  await Promise.all(
    photoIdTypes.map((idType) =>
      prisma.photoIdType.upsert({
        where: { name: idType.name },
        update: {
          description: idType.description,
          minLength: idType.minLength,
          maxLength: idType.maxLength,
          numberTypeEg: idType.numberTypeEg,
          validation: idType.validation,
        },
        create: idType,
      })
    )
  );

  const relationTypes = [
    { name: "Father", value: "01" },
    { name: "Mother", value: "02" },
    { name: "Husband", value: "03" },
    { name: "Wife", value: "04" },
    { name: "Guardian", value: "05" },
    { name: "Brother", value: "06" },
    { name: "Sister", value: "07" },
    { name: "Uncle", value: "08" },
    { name: "Aunt", value: "09" },
    { name: "Other", value: "99" },
  ];
  await Promise.all(
    relationTypes.map((rel) =>
      prisma.relationType.upsert({
        where: { name: rel.name },
        update: { value: rel.value },
        create: rel,
      })
    )
  );

  const loanTypes = [
    {
      name: "TWOWHEELER",
      label: "Two Wheeler Loan",
      description: "Loan for purchasing two-wheeler vehicles",
      rules: null,
    },
    {
      name: "AGRICULTURE",
      label: "Agriculture Loan",
      description: "Loan for agricultural equipment and farm use",
      rules: null,
    },
    {
      name: "MSME",
      label: "MSME Loan",
      description: "Loan for Micro, Small & Medium Enterprises",
      rules: null,
    },
  ];
  await Promise.all(
    loanTypes.map((lt) =>
      prisma.loanType.upsert({
        where: { name: lt.name },
        update: { label: lt.label, description: lt.description, rules: lt.rules },
        create: lt,
      })
    )
  );

  console.log("✅ Reference data seeded.");

  // ============================================================
  // 👤 ADMIN
  // ============================================================
  const admin = await prisma.admin.create({
    data: {
      name: "Super Admin",
      email: `admin@${companyName}.com`,
      password: hashedPassword,
    },
  });
  console.log(`✅ Admin created: admin@${companyName}.com / Admin@1234`);

  // ============================================================
  // 🏢 LOCATION: State → City → Region
  // ============================================================
  const maharastra = await prisma.state.findUnique({ where: { name: "MAHARASTRA" } });
  const gujarat = await prisma.state.findUnique({ where: { name: "GUJARAT" } });

  const mumbaiCity = await prisma.city.create({
    data: { name: "Mumbai", stateId: maharastra.id },
  });
  const puneCity = await prisma.city.create({
    data: { name: "Pune", stateId: maharastra.id },
  });
  const ahmedabadCity = await prisma.city.create({
    data: { name: "Ahmedabad", stateId: gujarat.id },
  });

  const mumbaiRegion = await prisma.region.create({
    data: { name: "Mumbai West", stateId: maharastra.id, cityId: mumbaiCity.id },
  });
  const puneRegion = await prisma.region.create({
    data: { name: "Pune Central", stateId: maharastra.id, cityId: puneCity.id },
  });
  const ahmedabadRegion = await prisma.region.create({
    data: { name: "Ahmedabad North", stateId: gujarat.id, cityId: ahmedabadCity.id },
  });

  // ============================================================
  // 🏦 BRANCHES & SHOWROOMS
  // ============================================================
  const mumbaiMainBranch = await prisma.branch.create({
    data: {
      name: "Mumbai Main Branch",
      regionId: mumbaiRegion.id,
      address: "101, Marine Lines, Mumbai",
      pincode: 400020,
      phone: "02212345678",
      email: "mumbai@kushalfinance.com",
    },
  });
  const puneBranch = await prisma.branch.create({
    data: {
      name: "Pune Branch",
      regionId: puneRegion.id,
      address: "45, MG Road, Pune",
      pincode: 411001,
      phone: "02098765432",
      email: "pune@kushalfinance.com",
    },
  });
  const ahmedabadBranch = await prisma.branch.create({
    data: {
      name: "Ahmedabad Branch",
      regionId: ahmedabadRegion.id,
      address: "22, CG Road, Ahmedabad",
      pincode: 380006,
      phone: "07912345678",
      email: "ahmedabad@kushalfinance.com",
    },
  });

  const mumbaiShowroom = await prisma.showroom.create({
    data: {
      name: "Mumbai Premium Showroom",
      branchId: mumbaiMainBranch.id,
      address: "5, Linking Road, Bandra, Mumbai",
      pincode: 400050,
    },
  });
  const puneShowroom = await prisma.showroom.create({
    data: {
      name: "Pune Auto Hub",
      branchId: puneBranch.id,
      address: "78, Karve Road, Pune",
      pincode: 411004,
    },
  });

  // ============================================================
  // 🚗 VEHICLE MASTERS
  // ============================================================
  const hondaBrand = await prisma.vehicleBrand.create({ data: { name: "Honda" } });
  const heroBrand = await prisma.vehicleBrand.create({ data: { name: "Hero" } });
  const bajajBrand = await prisma.vehicleBrand.create({ data: { name: "Bajaj" } });

  const activa = await prisma.vehicleModel.create({ data: { name: "Activa", brandId: hondaBrand.id } });
  const shine = await prisma.vehicleModel.create({ data: { name: "Shine", brandId: hondaBrand.id } });
  const splendor = await prisma.vehicleModel.create({ data: { name: "Splendor Plus", brandId: heroBrand.id } });
  const pulsar = await prisma.vehicleModel.create({ data: { name: "Pulsar 150", brandId: bajajBrand.id } });

  const activa6g = await prisma.vehicleVariant.create({ data: { name: "6G DLX", modelId: activa.id } });
  await prisma.vehicleVariant.create({ data: { name: "5G STD", modelId: activa.id } });
  const shineStd = await prisma.vehicleVariant.create({ data: { name: "Standard", modelId: shine.id } });
  const splendorStd = await prisma.vehicleVariant.create({ data: { name: "i3S", modelId: splendor.id } });
  const pulsarStd = await prisma.vehicleVariant.create({ data: { name: "Twin Disc", modelId: pulsar.id } });

  // ============================================================
  // 🌾 AGRICULTURE EQUIPMENT
  // ============================================================
  const tractor = await prisma.equipment.create({ data: { name: "Tractor" } });
  await prisma.equipment.create({ data: { name: "Harvester" } });
  await prisma.equipment.create({ data: { name: "Water Pump" } });

  console.log("✅ Location, branches, vehicles, equipment created.");

  // ============================================================
  // 🔐 ROLES & PERMISSIONS
  // ============================================================
  const FINANCE_MANAGER_PERMISSIONS = [
    "USER_CREATE", "USER_EDIT", "USER_BLOCK", "USER_ACTIVITY_VIEW",
    "EMPLOYEE_ACTIVITY_VIEW", "EMPLOYEE_LOGIN_HISTORY_VIEW",
    "LOAN_CREATE", "LOAN_EDIT", "LOAN_APPROVE", "LOAN_CLOSE",
    "PAYMENT_CREATE", "PAYMENT_EDIT", "PAYMENT_VERIFY", "PAYMENT_ALL_VIEW",
    "FORECLOSE_VIEW",
    "SEIZED_CREATE", "SEIZED_EDIT", "SEIZED_VIEW", "SEIZED_COMPLETE", "SEIZED_CLOSE", "SEIZED_RELEASE",
    "MASTER_VEHICLE_CREATE", "MASTER_VEHICLE_EDIT",
    "MASTER_AGRICULTURE_CREATE", "MASTER_AGRICULTURE_EDIT",
    "MASTER_BRANCH_CREATE", "MASTER_BRANCH_EDIT",
    "REGION_CREATE", "REGION_EDIT",
    "LOANTYPE_CREATE", "LOANTYPE_EDIT",
    "TERMINATION_CREATE",
  ];

  const SALES_EXECUTIVE_PERMISSIONS = [
    "USER_CREATE", "USER_EDIT", "USER_ACTIVITY_VIEW",
    "LOAN_CREATE", "LOAN_EDIT",
    "PAYMENT_CREATE", "PAYMENT_ALL_VIEW",
    "FORECLOSE_VIEW",
    "SEIZED_VIEW",
  ];

  const SUPPORT_AGENT_PERMISSIONS = [
    "USER_ACTIVITY_VIEW",
    "PAYMENT_ALL_VIEW",
    "SEIZED_VIEW",
    "FORECLOSE_VIEW",
  ];

  const financeManagerRole = await prisma.role.create({
    data: {
      name: "Finance Manager",
      description: "Manages loans, payments, verifications, and approvals",
      permissions: FINANCE_MANAGER_PERMISSIONS,
    },
  });

  const salesExecutiveRole = await prisma.role.create({
    data: {
      name: "Sales Executive",
      description: "Creates users, initiates loans and records payments",
      permissions: SALES_EXECUTIVE_PERMISSIONS,
    },
  });

  const supportAgentRole = await prisma.role.create({
    data: {
      name: "Support Agent",
      description: "Read-only view for support and reporting",
      permissions: SUPPORT_AGENT_PERMISSIONS,
    },
  });

  console.log("✅ Roles created.");

  // ============================================================
  // 👨‍💼 EMPLOYEES
  // ============================================================
  const emp1 = await prisma.employee.create({
    data: {
      name: "Rajesh Kumar",
      email: "rajesh.kumar@kushalfinance.com",
      password: employeePassword,
      roleId: financeManagerRole.id,
      adminId: admin.id,
      branchId: mumbaiMainBranch.id,
      stateId: maharastra.id,
      cityId: mumbaiCity.id,
      regionId: mumbaiRegion.id,
    },
  });

  const emp2 = await prisma.employee.create({
    data: {
      name: "Priya Sharma",
      email: "priya.sharma@kushalfinance.com",
      password: employeePassword,
      roleId: salesExecutiveRole.id,
      adminId: admin.id,
      branchId: puneBranch.id,
      stateId: maharastra.id,
      cityId: puneCity.id,
      regionId: puneRegion.id,
    },
  });

  const emp3 = await prisma.employee.create({
    data: {
      name: "Amit Patel",
      email: "amit.patel@kushalfinance.com",
      password: employeePassword,
      roleId: salesExecutiveRole.id,
      adminId: admin.id,
      branchId: ahmedabadBranch.id,
      stateId: gujarat.id,
      cityId: ahmedabadCity.id,
      regionId: ahmedabadRegion.id,
    },
  });

  await prisma.employee.create({
    data: {
      name: "Sneha Joshi",
      email: "sneha.joshi@kushalfinance.com",
      password: employeePassword,
      roleId: supportAgentRole.id,
      adminId: admin.id,
      branchId: mumbaiMainBranch.id,
      stateId: maharastra.id,
      cityId: mumbaiCity.id,
      regionId: mumbaiRegion.id,
    },
  });

  const emp5 = await prisma.employee.create({
    data: {
      name: "Vikram Singh",
      email: "vikram.singh@kushalfinance.com",
      password: employeePassword,
      roleId: financeManagerRole.id,
      adminId: admin.id,
      branchId: puneBranch.id,
      stateId: maharastra.id,
      cityId: puneCity.id,
      regionId: puneRegion.id,
    },
  });

  console.log("✅ Employees created.");

  // ============================================================
  // 👥 USERS (borrowers)
  // ============================================================
  const maleGender = await prisma.gender.findUnique({ where: { name: "Male" } });
  const femaleGender = await prisma.gender.findUnique({ where: { name: "Female" } });
  const fatherRelation = await prisma.relationType.findUnique({ where: { name: "Father" } });

  const user1 = await prisma.user.create({
    data: {
      firstName: "Suresh",
      middleName: "Ramesh",
      lastName: "Mehta",
      relationFirstName: "Ramesh",
      relationLastName: "Mehta",
      dateOfBirth: new Date("1985-04-15"),
      maritalStatus: "Married",
      email: "suresh.mehta@gmail.com",
      phone: "9876543210",
      qualification: "Graduate",
      profession: "Shopkeeper",
      creditScore: 720,
      genderId: maleGender.id,
      relationTypeId: fatherRelation.id,
      regionId: mumbaiRegion.id,
      adminId: admin.id,
      employeeId: emp1.id,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      firstName: "Kavita",
      middleName: "Sanjay",
      lastName: "Desai",
      relationFirstName: "Sanjay",
      relationLastName: "Desai",
      dateOfBirth: new Date("1990-08-22"),
      maritalStatus: "Married",
      email: "kavita.desai@gmail.com",
      phone: "9765432109",
      qualification: "Post Graduate",
      profession: "Teacher",
      creditScore: 760,
      genderId: femaleGender.id,
      relationTypeId: fatherRelation.id,
      regionId: puneRegion.id,
      adminId: admin.id,
      employeeId: emp2.id,
    },
  });

  const user3 = await prisma.user.create({
    data: {
      firstName: "Mohan",
      middleName: "Lal",
      lastName: "Verma",
      relationFirstName: "Lal",
      relationLastName: "Verma",
      dateOfBirth: new Date("1978-12-01"),
      maritalStatus: "Married",
      email: "mohan.verma@gmail.com",
      phone: "9654321098",
      qualification: "High School",
      profession: "Farmer",
      creditScore: 650,
      genderId: maleGender.id,
      relationTypeId: fatherRelation.id,
      regionId: ahmedabadRegion.id,
      adminId: admin.id,
      employeeId: emp3.id,
    },
  });

  const user4 = await prisma.user.create({
    data: {
      firstName: "Anita",
      middleName: "Prakash",
      lastName: "Kulkarni",
      relationFirstName: "Prakash",
      relationLastName: "Kulkarni",
      dateOfBirth: new Date("1992-06-17"),
      maritalStatus: "Single",
      email: "anita.kulkarni@gmail.com",
      phone: "9543210987",
      qualification: "Graduate",
      profession: "Business",
      creditScore: 700,
      genderId: femaleGender.id,
      relationTypeId: fatherRelation.id,
      regionId: puneRegion.id,
      adminId: admin.id,
      employeeId: emp5.id,
    },
  });

  const user5 = await prisma.user.create({
    data: {
      firstName: "Ravi",
      middleName: "Shankar",
      lastName: "Yadav",
      relationFirstName: "Shankar",
      relationLastName: "Yadav",
      dateOfBirth: new Date("1982-03-25"),
      maritalStatus: "Married",
      email: "ravi.yadav@gmail.com",
      phone: "9432109876",
      qualification: "Graduate",
      profession: "Contractor",
      creditScore: 680,
      genderId: maleGender.id,
      relationTypeId: fatherRelation.id,
      regionId: mumbaiRegion.id,
      adminId: admin.id,
      employeeId: emp1.id,
    },
  });

  const user6 = await prisma.user.create({
    data: {
      firstName: "Deepak",
      middleName: "Narayan",
      lastName: "Shah",
      relationFirstName: "Narayan",
      relationLastName: "Shah",
      dateOfBirth: new Date("1975-09-10"),
      maritalStatus: "Married",
      email: "deepak.shah@gmail.com",
      phone: "9321098765",
      qualification: "Graduate",
      profession: "Trader",
      creditScore: 710,
      genderId: maleGender.id,
      relationTypeId: fatherRelation.id,
      regionId: ahmedabadRegion.id,
      adminId: admin.id,
      employeeId: emp3.id,
    },
  });

  console.log("✅ Users created.");

  // ============================================================
  // 💳 LOANS
  // ============================================================
  const twLoanType = await prisma.loanType.findUnique({ where: { name: "TWOWHEELER" } });
  const agriLoanType = await prisma.loanType.findUnique({ where: { name: "AGRICULTURE" } });
  const msmeLoanType = await prisma.loanType.findUnique({ where: { name: "MSME" } });

  // ---- LOAN 1: Two Wheeler - ACTIVE (several EMIs paid & verified) ----
  const loan1StartDate = new Date("2024-06-05");
  const loan1EndDate = new Date("2026-06-05");
  const loan1Principal = 75000;
  const loan1Interest = 15000;
  const loan1Total = 90000;
  const loan1Monthly = 3750;
  const loan1Tenure = 24;

  const loan1 = await prisma.loan.create({
    data: {
      fileNo: "KF-2024-001",
      loanTypeId: twLoanType.id,
      userId: user1.id,
      adminId: admin.id,
      employeeId: emp1.id,
      approvedByAdminId: admin.id,
      branchId: mumbaiMainBranch.id,
      showroomId: mumbaiShowroom.id,
      principalLoanAmount: loan1Principal,
      interestAmount: loan1Interest,
      totalAmount: loan1Total,
      totalPaidPrincipal: 28125,
      totalPaidInterest: 5625,
      totalPaidFine: 0,
      totalPaidAmount: 33750,
      monthlyPayableAmount: loan1Monthly,
      pendingAmount: loan1Total - 33750,
      interestRate: 20,
      interestType: "FLAT",
      penaltyPercentage: 2,
      tenureMonths: loan1Tenure,
      startDate: loan1StartDate,
      endDate: loan1EndDate,
      dueDay: 5,
      disbursedDate: new Date("2024-06-01"),
      agreementDate: new Date("2024-06-01"),
      fileStatus: "ACTIVE",
      approvedAt: new Date("2024-05-30"),
    },
  });

  await prisma.twoWheelerLoan.create({
    data: {
      loanId: loan1.id,
      brandId: hondaBrand.id,
      modelId: activa.id,
      variantId: activa6g.id,
      registrationNumber: "MH01AB1234",
      chassisNumber: "ME4JF503EG8014321",
      engineNumber: "JF50EG8014321",
      rcNumber: "RC/MH/2024/001",
    },
  });

  // Create EMIs for loan1 - first 9 paid, rest unpaid
  const loan1EMIs = [];
  for (let i = 0; i < loan1Tenure; i++) {
    const paymentFor = new Date("2024-06-05");
    paymentFor.setMonth(paymentFor.getMonth() + i);
    const isPaid = i < 9;
    const emi = await prisma.eMI.create({
      data: {
        loanId: loan1.id,
        paymentFor,
        emiPayAmount: loan1Monthly,
        principalAmt: 3125,
        interestAmt: 625,
        amountPaidSoFar: isPaid ? loan1Monthly : 0,
        totalPaid: isPaid ? loan1Monthly : 0,
        principalPaid: isPaid ? 3125 : 0,
        interestPaid: isPaid ? 625 : 0,
        finePaid: 0,
        status: isPaid ? "PAID" : "UNPAID",
        verified: isPaid,
        verifiedAt: isPaid ? new Date(paymentFor.getTime() + 2 * 24 * 3600 * 1000) : null,
        verifiedByAdminId: isPaid ? admin.id : null,
      },
    });
    loan1EMIs.push(emi);

    if (isPaid) {
      await prisma.payment.create({
        data: {
          loanId: loan1.id,
          emiId: emi.id,
          amount: loan1Monthly,
          paymentDate: paymentFor,
          paymentMode: "CASH",
          status: "PAID",
          verified: true,
          verifiedAt: new Date(paymentFor.getTime() + 2 * 24 * 3600 * 1000),
          verifiedByAdminId: admin.id,
          adminId: admin.id,
          employeeId: emp1.id,
          loanPendingBefore: loan1Total - (i * loan1Monthly),
          loanPendingAfter: loan1Total - ((i + 1) * loan1Monthly),
        },
      });
    }
  }

  // Add 1 unverified payment on 10th EMI
  await prisma.payment.create({
    data: {
      loanId: loan1.id,
      emiId: loan1EMIs[9].id,
      amount: loan1Monthly,
      paymentDate: new Date("2025-04-05"),
      paymentMode: "UPI",
      transactionId: "UPI20250405001",
      status: "UNVERIFIED",
      verified: false,
      employeeId: emp1.id,
      loanPendingBefore: loan1Total - 33750,
      loanPendingAfter: loan1Total - 33750 - loan1Monthly,
    },
  });

  // ---- LOAN 2: Two Wheeler - PENDING APPROVAL ----
  const loan2 = await prisma.loan.create({
    data: {
      fileNo: "KF-2024-002",
      loanTypeId: twLoanType.id,
      userId: user2.id,
      adminId: admin.id,
      employeeId: emp2.id,
      branchId: puneBranch.id,
      showroomId: puneShowroom.id,
      principalLoanAmount: 60000,
      interestAmount: 10800,
      totalAmount: 70800,
      totalPaidPrincipal: 0,
      totalPaidInterest: 0,
      totalPaidFine: 0,
      totalPaidAmount: 0,
      monthlyPayableAmount: 2950,
      pendingAmount: 70800,
      interestRate: 18,
      interestType: "FLAT",
      penaltyPercentage: 2,
      tenureMonths: 24,
      startDate: new Date("2025-01-10"),
      endDate: new Date("2027-01-10"),
      dueDay: 10,
      fileStatus: "PENDING_APPROVAL",
    },
  });

  await prisma.twoWheelerLoan.create({
    data: {
      loanId: loan2.id,
      brandId: heroBrand.id,
      modelId: splendor.id,
      variantId: splendorStd.id,
      registrationNumber: "MH12CD5678",
      chassisNumber: "MBLHA10EXLM012345",
      engineNumber: "HA10EXLM012345",
      rcNumber: "RC/MH/2025/002",
    },
  });

  // ---- LOAN 3: Agriculture - ACTIVE (some EMIs paid) ----
  const loan3 = await prisma.loan.create({
    data: {
      fileNo: "KF-2024-003",
      loanTypeId: agriLoanType.id,
      userId: user3.id,
      adminId: admin.id,
      employeeId: emp3.id,
      approvedByAdminId: admin.id,
      branchId: ahmedabadBranch.id,
      principalLoanAmount: 200000,
      interestAmount: 48000,
      totalAmount: 248000,
      totalPaidPrincipal: 50000,
      totalPaidInterest: 12000,
      totalPaidFine: 500,
      totalPaidAmount: 62500,
      monthlyPayableAmount: 10333,
      pendingAmount: 248000 - 62500,
      interestRate: 24,
      interestType: "FLAT",
      penaltyPercentage: 3,
      tenureMonths: 24,
      startDate: new Date("2024-03-01"),
      endDate: new Date("2026-03-01"),
      dueDay: 1,
      disbursedDate: new Date("2024-03-01"),
      agreementDate: new Date("2024-03-01"),
      fileStatus: "ACTIVE",
      approvedAt: new Date("2024-02-28"),
    },
  });

  await prisma.agricultureLoan.create({
    data: {
      loanId: loan3.id,
      equipmentId: tractor.id,
      usageArea: "25 Acres - Wheat Farming",
      isSeasonal: true,
      registrationNumber: "GJ-TRK-2024-001",
    },
  });

  // Create EMIs for loan3 - first 6 paid
  for (let i = 0; i < 24; i++) {
    const paymentFor = new Date("2024-03-01");
    paymentFor.setMonth(paymentFor.getMonth() + i);
    const isPaid = i < 6;
    const emi3 = await prisma.eMI.create({
      data: {
        loanId: loan3.id,
        paymentFor,
        emiPayAmount: 10333,
        principalAmt: 8333,
        interestAmt: 2000,
        amountPaidSoFar: isPaid ? (i < 5 ? 10333 : 10833) : 0,
        totalPaid: isPaid ? (i < 5 ? 10333 : 10833) : 0,
        principalPaid: isPaid ? 8333 : 0,
        interestPaid: isPaid ? 2000 : 0,
        finePaid: isPaid && i === 5 ? 500 : 0,
        status: isPaid ? "PAID" : "UNPAID",
        isDelayed: i === 5,
        delayDays: i === 5 ? 5 : null,
        fineAmount: i === 5 ? 500 : null,
        verified: isPaid,
        verifiedAt: isPaid ? new Date(paymentFor.getTime() + 3 * 24 * 3600 * 1000) : null,
        verifiedByAdminId: isPaid ? admin.id : null,
      },
    });

    if (isPaid) {
      await prisma.payment.create({
        data: {
          loanId: loan3.id,
          emiId: emi3.id,
          amount: i < 5 ? 10333 : 10833,
          paymentDate: paymentFor,
          paymentMode: i % 2 === 0 ? "CASH" : "CHEQUE",
          transactionId: i % 2 === 1 ? `CHQ-2024-00${i + 1}` : null,
          status: "PAID",
          verified: true,
          verifiedAt: new Date(paymentFor.getTime() + 3 * 24 * 3600 * 1000),
          verifiedByAdminId: admin.id,
          adminId: admin.id,
          employeeId: emp3.id,
          loanPendingBefore: 248000 - (i * 10333),
          loanPendingAfter: 248000 - ((i + 1) * 10333),
        },
      });
    }
  }

  // ---- LOAN 4: MSME - ACTIVE (recently disbursed, 2 EMIs paid) ----
  const loan4 = await prisma.loan.create({
    data: {
      fileNo: "KF-2025-004",
      loanTypeId: msmeLoanType.id,
      userId: user4.id,
      adminId: admin.id,
      employeeId: emp5.id,
      approvedByAdminId: admin.id,
      branchId: puneBranch.id,
      principalLoanAmount: 500000,
      interestAmount: 90000,
      totalAmount: 590000,
      totalPaidPrincipal: 41667,
      totalPaidInterest: 7500,
      totalPaidFine: 0,
      totalPaidAmount: 49167,
      monthlyPayableAmount: 24583,
      pendingAmount: 590000 - 49167,
      interestRate: 18,
      interestType: "FLAT",
      penaltyPercentage: 2,
      tenureMonths: 24,
      startDate: new Date("2025-02-01"),
      endDate: new Date("2027-02-01"),
      dueDay: 1,
      disbursedDate: new Date("2025-02-01"),
      agreementDate: new Date("2025-02-01"),
      fileStatus: "ACTIVE",
      approvedAt: new Date("2025-01-28"),
    },
  });

  await prisma.mSMELoan.create({
    data: {
      loanId: loan4.id,
      businessName: "Kulkarni Textiles Pvt Ltd",
      registrationNumber: "MH/MSME/2025/001",
      businessType: "Manufacturing",
      monthlyRevenue: 150000,
      gstNumber: "27AAJCK1234A1Z5",
    },
  });

  for (let i = 0; i < 24; i++) {
    const paymentFor = new Date("2025-02-01");
    paymentFor.setMonth(paymentFor.getMonth() + i);
    const isPaid = i < 2;
    const emi4 = await prisma.eMI.create({
      data: {
        loanId: loan4.id,
        paymentFor,
        emiPayAmount: 24583,
        principalAmt: 20833,
        interestAmt: 3750,
        amountPaidSoFar: isPaid ? 24583 : 0,
        totalPaid: isPaid ? 24583 : 0,
        principalPaid: isPaid ? 20833 : 0,
        interestPaid: isPaid ? 3750 : 0,
        finePaid: 0,
        status: isPaid ? "PAID" : "UNPAID",
        verified: isPaid,
        verifiedAt: isPaid ? new Date(paymentFor.getTime() + 1 * 24 * 3600 * 1000) : null,
        verifiedByEmployeeId: isPaid ? emp5.id : null,
      },
    });

    if (isPaid) {
      await prisma.payment.create({
        data: {
          loanId: loan4.id,
          emiId: emi4.id,
          amount: 24583,
          paymentDate: paymentFor,
          paymentMode: "ONLINE",
          transactionId: `TXN-MSME-2025-00${i + 1}`,
          status: "PAID",
          verified: true,
          verifiedAt: new Date(paymentFor.getTime() + 1 * 24 * 3600 * 1000),
          verifiedByEmployeeId: emp5.id,
          adminId: admin.id,
          employeeId: emp5.id,
          loanPendingBefore: 590000 - (i * 24583),
          loanPendingAfter: 590000 - ((i + 1) * 24583),
        },
      });
    }
  }

  // ---- LOAN 5: Two Wheeler - CLOSED (fully paid) ----
  const loan5Total = 54000;
  const loan5Monthly = 2250;
  const loan5Tenure = 24;

  const loan5 = await prisma.loan.create({
    data: {
      fileNo: "KF-2023-005",
      loanTypeId: twLoanType.id,
      userId: user5.id,
      adminId: admin.id,
      employeeId: emp1.id,
      approvedByAdminId: admin.id,
      branchId: mumbaiMainBranch.id,
      showroomId: mumbaiShowroom.id,
      principalLoanAmount: 45000,
      interestAmount: 9000,
      totalAmount: loan5Total,
      totalPaidPrincipal: 45000,
      totalPaidInterest: 9000,
      totalPaidFine: 0,
      totalPaidAmount: loan5Total,
      monthlyPayableAmount: loan5Monthly,
      pendingAmount: 0,
      interestRate: 20,
      interestType: "FLAT",
      penaltyPercentage: 2,
      tenureMonths: loan5Tenure,
      startDate: new Date("2023-01-05"),
      endDate: new Date("2025-01-05"),
      dueDay: 5,
      disbursedDate: new Date("2023-01-01"),
      agreementDate: new Date("2023-01-01"),
      fileStatus: "CLOSED",
      isClosed: true,
      approvedAt: new Date("2022-12-30"),
    },
  });

  await prisma.twoWheelerLoan.create({
    data: {
      loanId: loan5.id,
      brandId: bajajBrand.id,
      modelId: pulsar.id,
      variantId: pulsarStd.id,
      registrationNumber: "MH02EF7890",
      chassisNumber: "MD2A11CY9HCK12345",
      engineNumber: "DHGBCK12345",
      rcNumber: "RC/MH/2023/005",
    },
  });

  for (let i = 0; i < loan5Tenure; i++) {
    const paymentFor = new Date("2023-01-05");
    paymentFor.setMonth(paymentFor.getMonth() + i);
    const emi5 = await prisma.eMI.create({
      data: {
        loanId: loan5.id,
        paymentFor,
        emiPayAmount: loan5Monthly,
        principalAmt: 1875,
        interestAmt: 375,
        amountPaidSoFar: loan5Monthly,
        totalPaid: loan5Monthly,
        principalPaid: 1875,
        interestPaid: 375,
        finePaid: 0,
        status: "PAID",
        verified: true,
        verifiedAt: new Date(paymentFor.getTime() + 1 * 24 * 3600 * 1000),
        verifiedByAdminId: admin.id,
      },
    });

    await prisma.payment.create({
      data: {
        loanId: loan5.id,
        emiId: emi5.id,
        amount: loan5Monthly,
        paymentDate: paymentFor,
        paymentMode: i % 3 === 0 ? "CASH" : i % 3 === 1 ? "CHEQUE" : "UPI",
        transactionId: i % 3 === 2 ? `UPI-2023-${(i + 1).toString().padStart(3, "0")}` : null,
        status: "PAID",
        verified: true,
        verifiedAt: new Date(paymentFor.getTime() + 1 * 24 * 3600 * 1000),
        verifiedByAdminId: admin.id,
        adminId: admin.id,
        employeeId: emp1.id,
        loanPendingBefore: loan5Total - (i * loan5Monthly),
        loanPendingAfter: loan5Total - ((i + 1) * loan5Monthly),
      },
    });
  }

  // ---- LOAN 6: Two Wheeler - OVERDUE ----
  const loan6 = await prisma.loan.create({
    data: {
      fileNo: "KF-2024-006",
      loanTypeId: twLoanType.id,
      userId: user6.id,
      adminId: admin.id,
      employeeId: emp3.id,
      approvedByAdminId: admin.id,
      branchId: ahmedabadBranch.id,
      principalLoanAmount: 80000,
      interestAmount: 19200,
      totalAmount: 99200,
      totalPaidPrincipal: 20000,
      totalPaidInterest: 4800,
      totalPaidFine: 1200,
      totalPaidAmount: 26000,
      monthlyPayableAmount: 4133,
      pendingAmount: 99200 - 26000,
      interestRate: 24,
      interestType: "FLAT",
      penaltyPercentage: 3,
      tenureMonths: 24,
      startDate: new Date("2024-04-01"),
      endDate: new Date("2026-04-01"),
      dueDay: 1,
      disbursedDate: new Date("2024-04-01"),
      agreementDate: new Date("2024-04-01"),
      fileStatus: "OVERDUE",
      totalDelayDays: 32,
      approvedAt: new Date("2024-03-28"),
    },
  });

  await prisma.twoWheelerLoan.create({
    data: {
      loanId: loan6.id,
      brandId: hondaBrand.id,
      modelId: shine.id,
      variantId: shineStd.id,
      registrationNumber: "GJ01GH2345",
      chassisNumber: "ME4JC55CLH8123456",
      engineNumber: "JC55EH8123456",
      rcNumber: "RC/GJ/2024/006",
    },
  });

  // Create EMIs for loan6 - first 5 paid with delays, 2 overdue
  for (let i = 0; i < 24; i++) {
    const paymentFor = new Date("2024-04-01");
    paymentFor.setMonth(paymentFor.getMonth() + i);
    const isPaid = i < 5;
    const isDelayed = i === 3 || i === 4;
    const fine = isDelayed ? 400 : 0;
    const emi6 = await prisma.eMI.create({
      data: {
        loanId: loan6.id,
        paymentFor,
        emiPayAmount: 4133,
        principalAmt: 3333,
        interestAmt: 800,
        amountPaidSoFar: isPaid ? 4133 + fine : 0,
        totalPaid: isPaid ? 4133 + fine : 0,
        principalPaid: isPaid ? 3333 : 0,
        interestPaid: isPaid ? 800 : 0,
        finePaid: isPaid ? fine : 0,
        fineAmount: isDelayed ? fine : null,
        status: isPaid ? "PAID" : i < 7 ? "OVERDUE" : "UNPAID",
        isDelayed,
        delayDays: isDelayed ? 10 : null,
        verified: isPaid,
        verifiedAt: isPaid ? new Date(paymentFor.getTime() + 5 * 24 * 3600 * 1000) : null,
        verifiedByAdminId: isPaid ? admin.id : null,
      },
    });

    if (isPaid) {
      await prisma.payment.create({
        data: {
          loanId: loan6.id,
          emiId: emi6.id,
          amount: 4133 + fine,
          paymentDate: new Date(paymentFor.getTime() + (isDelayed ? 10 : 2) * 24 * 3600 * 1000),
          paymentMode: "CASH",
          status: "PAID",
          verified: true,
          verifiedAt: new Date(paymentFor.getTime() + (isDelayed ? 10 : 2) * 24 * 3600 * 1000),
          verifiedByAdminId: admin.id,
          adminId: admin.id,
          employeeId: emp3.id,
          loanPendingBefore: 99200 - (i * 4133),
          loanPendingAfter: 99200 - ((i + 1) * 4133),
        },
      });
    }
  }

  console.log("✅ All loans with EMIs and payments created.");

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n========================================");
  console.log("🎉 DEMO SEEDING COMPLETE!");
  console.log("========================================\n");
  console.log("🔑 LOGIN CREDENTIALS:");
  console.log("----------------------------------------");
  console.log("👑 ADMIN");
  console.log(`   Email   : admin@${companyName}.com`);
  console.log("   Password: Admin@1234");
  console.log("");
  console.log("👨‍💼 EMPLOYEES (all use password: Employee@1234)");
  console.log("   1. Rajesh Kumar (Finance Manager - Mumbai)");
  console.log("      Email: rajesh.kumar@kushalfinance.com");
  console.log("   2. Priya Sharma (Sales Executive - Pune)");
  console.log("      Email: priya.sharma@kushalfinance.com");
  console.log("   3. Amit Patel (Sales Executive - Ahmedabad)");
  console.log("      Email: amit.patel@kushalfinance.com");
  console.log("   4. Sneha Joshi (Support Agent - Mumbai)");
  console.log("      Email: sneha.joshi@kushalfinance.com");
  console.log("   5. Vikram Singh (Finance Manager - Pune)");
  console.log("      Email: vikram.singh@kushalfinance.com");
  console.log("----------------------------------------");
  console.log("📋 DEMO LOANS:");
  console.log("   KF-2024-001 - Two Wheeler ACTIVE (9/24 paid, 1 unverified payment)");
  console.log("   KF-2024-002 - Two Wheeler PENDING_APPROVAL");
  console.log("   KF-2024-003 - Agriculture ACTIVE (6/24 paid, 1 delayed)");
  console.log("   KF-2025-004 - MSME ACTIVE (2/24 paid)");
  console.log("   KF-2023-005 - Two Wheeler CLOSED (fully paid)");
  console.log("   KF-2024-006 - Two Wheeler OVERDUE (5/24 paid with delays)");
  console.log("========================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
