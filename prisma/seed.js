const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("Admin@1234", 10);
  const employeePassword = await bcrypt.hash("Employee@1234", 10);

  // ============================================================
  // 🧹 CLEAR EXISTING DATA (keep reference data)
  // ============================================================
  console.log("🧹 Clearing existing data...");

  // Clear in dependency order — children before parents
  // Only includes tables confirmed to exist in the current DB migration
  await prisma.payment.deleteMany({});
  await prisma.eMI.deleteMany({});
  await prisma.loanGuarantor.deleteMany({});
  await prisma.twoWheelerLoan.deleteMany({});
  await prisma.agricultureLoan.deleteMany({});
  await prisma.mSMELoan.deleteMany({});
  await prisma.forecloseRequest.deleteMany({});
  await prisma.paymentOrder.deleteMany({});
  await prisma.terminationRequest.deleteMany({});
  await prisma.loan.deleteMany({});
  await prisma.userUpdateRequest.deleteMany({});
  await prisma.userAddress.deleteMany({});
  await prisma.photoID.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.actionLog.deleteMany({});
  await prisma.loginActivity.deleteMany({});
  await prisma.notificationLog.deleteMany({});
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

  console.log("✅ Existing data cleared.");

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

  // ============================================================
  // 🏙️ CITIES (mapped by state code)
  // ============================================================
  const allStates = await prisma.state.findMany({ select: { id: true, stateCode: true } });
  const stateById = {};
  allStates.forEach((s) => { stateById[s.stateCode] = s.id; });

  const citiesByStateCode = {
    "01": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Sopore", "Kathua", "Udhampur", "Rajouri", "Punch", "Leh"],
    "02": ["Shimla", "Dharamshala", "Solan", "Mandi", "Kullu", "Baddi", "Nahan", "Palampur", "Bilaspur", "Chamba"],
    "03": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Firozpur", "Hoshiarpur", "Gurdaspur", "Sangrur"],
    "04": ["Chandigarh"],
    "05": ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rishikesh", "Nainital", "Mussoorie", "Kotdwara", "Rudrapur", "Kashipur"],
    "06": ["Faridabad", "Gurgaon", "Panipat", "Ambala", "Yamunanagar", "Rohtak", "Hisar", "Karnal", "Sonipat", "Panchkula"],
    "07": ["New Delhi", "Dwarka", "Rohini", "Janakpuri", "Laxmi Nagar", "Saket", "Pitampura", "Nehru Place", "Karol Bagh", "Connaught Place"],
    "08": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Alwar", "Bharatpur", "Sikar", "Pali"],
    "09": ["Lucknow", "Kanpur", "Agra", "Varanasi", "Allahabad", "Meerut", "Ghaziabad", "Noida", "Bareilly", "Aligarh", "Moradabad", "Saharanpur", "Gorakhpur", "Firozabad", "Jhansi", "Muzaffarnagar", "Mathura", "Rampur", "Shahjahanpur", "Farrukhabad"],
    "10": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Arrah", "Bihar Sharif", "Begusarai", "Katihar"],
    "11": ["Gangtok", "Namchi", "Mangan", "Gyalshing"],
    "12": ["Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro", "Bomdila"],
    "13": ["Kohima", "Dimapur", "Mokokchung", "Tuensang", "Wokha"],
    "14": ["Imphal", "Thoubal", "Bishnupur", "Churachandpur", "Senapati"],
    "15": ["Aizawl", "Lunglei", "Champhai", "Serchhip", "Kolasib"],
    "16": ["Agartala", "Udaipur", "Dharmanagar", "Kailashahar", "Ambassa"],
    "17": ["Shillong", "Tura", "Jowai", "Nongstoin", "Baghmara"],
    "18": ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", "Tezpur", "Bongaigaon", "Dhubri", "Sivasagar"],
    "19": ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Bardhaman", "Malda", "Baharampur", "Habra", "Kharagpur", "Haldia", "Raiganj", "Bankura", "Purulia", "Cooch Behar"],
    "20": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar", "Phusro", "Hazaribagh", "Giridih", "Ramgarh", "Medininagar"],
    "21": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri", "Balasore", "Baripada", "Bhadrak", "Jeypore"],
    "22": ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon", "Jagdalpur", "Ambikapur", "Raigarh", "Dhamtari"],
    "23": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna", "Ratlam", "Rewa", "Murwara", "Singrauli", "Burhanpur", "Khandwa", "Bhind"],
    "24": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar", "Junagadh", "Anand", "Navsari", "Morbi", "Nadiad", "Surendranagar", "Bharuch", "Mehsana"],
    "25": ["Daman", "Diu", "Silvassa (DD)"],
    "26": ["Silvassa (DNH)", "Amli", "Khanvel"],
    "27": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Solapur", "Kolhapur", "Thane", "Navi Mumbai", "Pimpri-Chinchwad", "Amravati", "Nanded", "Sangli", "Malegaon", "Jalgaon", "Akola", "Latur", "Dhule", "Ahmednagar", "Chandrapur", "Parbhani", "Ichalkaranji", "Jalna", "Ambernath", "Bhiwandi"],
    "29": ["Bengaluru", "Mysuru", "Hubballi", "Mangaluru", "Belagavi", "Kalaburagi", "Ballari", "Vijayapura", "Shivamogga", "Tumakuru", "Davanagere", "Bidar", "Udupi", "Hassan", "Dharwad"],
    "30": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Bicholim", "Valpoi"],
    "31": ["Kavaratti", "Agatti", "Amini", "Andrott"],
    "32": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Palakkad", "Alappuzha", "Malappuram", "Kannur", "Kasaragod", "Kottayam", "Idukki", "Pathanamthitta", "Wayanad"],
    "33": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Vellore", "Erode", "Thoothukudi", "Tiruppur", "Dindigul", "Thanjavur", "Ranipet", "Sivakasi", "Karur"],
    "34": ["Puducherry", "Karaikal", "Mahe", "Yanam"],
    "35": ["Port Blair", "Diglipur", "Rangat", "Car Nicobar"],
    "36": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Ramagundam", "Mahbubnagar", "Nalgonda", "Adilabad", "Suryapet"],
    "37": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Kakinada", "Tirupati", "Rajahmundry", "Kadapa", "Anantapur", "Eluru", "Ongole", "Vizianagaram", "Srikakulam", "Chittoor"],
  };

  let cityCount = 0;
  for (const [stateCode, cities] of Object.entries(citiesByStateCode)) {
    const stateId = stateById[stateCode];
    if (!stateId) continue;
    for (const cityName of cities) {
      await prisma.city.upsert({
        where: { name: cityName },
        update: {},
        create: { name: cityName, stateId },
      });
      cityCount++;
    }
  }
  console.log(`✅ ${cityCount} cities seeded.`);

  console.log("✅ Reference data seeded.");

  // ============================================================
  // 👤 ADMIN
  // ============================================================
  const admin = await prisma.admin.create({
    data: {
      name: "Super Admin",
      email: "admin@finance.com",
      password: hashedPassword,
    },
  });
  console.log("✅ Admin created: admin@finance.com / Admin@1234");

  // ============================================================
  // 🔐 ROLES & PERMISSIONS
  // ============================================================
  const FINANCE_MANAGER_PERMISSIONS = [
    "USER_CREATE", "USER_EDIT", "USER_BLOCK", "USER_ACTIVITY_VIEW",
    "EMPLOYEE_ACTIVITY_VIEW", "EMPLOYEE_LOGIN_HISTORY_VIEW",
    "LOAN_CREATE", "LOAN_EDIT", "LOAN_APPROVE", "LOAN_CLOSE",
    "PAYMENT_CREATE", "PAYMENT_EDIT", "PAYMENT_VERIFY", "PAYMENT_ALL_VIEW",
    "KYC_VIEW", "KYC_APPROVE",
    "COLLECTION_MANAGE",
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
    "GRIEVANCE_MANAGE",
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
  const empRajesh = await prisma.employee.create({
    data: {
      name: "Rajesh Kumar",
      email: "rajesh.kumar@finance.com",
      password: employeePassword,
      roleId: financeManagerRole.id,
      adminId: admin.id,
    },
  });

  const empPriya = await prisma.employee.create({
    data: {
      name: "Priya Sharma",
      email: "priya.sharma@finance.com",
      password: employeePassword,
      roleId: salesExecutiveRole.id,
      adminId: admin.id,
    },
  });

  const empAmit = await prisma.employee.create({
    data: {
      name: "Amit Patel",
      email: "amit.patel@finance.com",
      password: employeePassword,
      roleId: salesExecutiveRole.id,
      adminId: admin.id,
    },
  });

  const empSneha = await prisma.employee.create({
    data: {
      name: "Sneha Joshi",
      email: "sneha.joshi@finance.com",
      password: employeePassword,
      roleId: supportAgentRole.id,
      adminId: admin.id,
    },
  });

  const empVikram = await prisma.employee.create({
    data: {
      name: "Vikram Singh",
      email: "vikram.singh@finance.com",
      password: employeePassword,
      roleId: financeManagerRole.id,
      adminId: admin.id,
    },
  });

  console.log("✅ Employees created.");

  // ============================================================
  // 🔔 NOTIFICATIONS
  // ============================================================
  const now = new Date();
  const minsAgo = (m) => new Date(now - m * 60 * 1000);

  await prisma.notificationLog.createMany({
    data: [
      // ── Admin notifications ──────────────────────────────────
      {
        targetType: "ADMIN", targetId: admin.id,
        triggerEvent: "LOAN_APPROVED", channel: "IN_APP", status: "PENDING",
        title: "Loan Approved",
        contentRendered: "Loan #LN-2025-001 for Ramesh Verma has been approved by Rajesh Kumar.",
        linkUrl: "/loan-applications",
        isRead: false, createdAt: minsAgo(5),
      },
      {
        targetType: "ADMIN", targetId: admin.id,
        triggerEvent: "PAYMENT_RECEIVED", channel: "IN_APP", status: "PENDING",
        title: "Payment Received",
        contentRendered: "EMI payment of ₹12,500 received for loan #LN-2025-003 via UPI.",
        linkUrl: "/loan/payments",
        isRead: false, createdAt: minsAgo(18),
      },
      {
        targetType: "ADMIN", targetId: admin.id,
        triggerEvent: "KYC_SUBMITTED", channel: "IN_APP", status: "PENDING",
        title: "KYC Pending Review",
        contentRendered: "Sunita Devi has submitted KYC documents. Verification pending.",
        linkUrl: "/kyc",
        isRead: false, createdAt: minsAgo(42),
      },
      {
        targetType: "ADMIN", targetId: admin.id,
        triggerEvent: "FORECLOSE_REQUEST", channel: "IN_APP", status: "PENDING",
        title: "Foreclosure Request",
        contentRendered: "Pre-closure request raised for loan #LN-2024-088. Amount: ₹1,45,000.",
        linkUrl: "/loan/approvals/foreclose",
        isRead: false, createdAt: minsAgo(75),
      },
      {
        targetType: "ADMIN", targetId: admin.id,
        triggerEvent: "OVERDUE_ALERT", channel: "IN_APP", status: "PENDING",
        title: "Overdue EMIs — Action Required",
        contentRendered: "5 loans have EMIs overdue by more than 30 days. Review collection cases.",
        linkUrl: "/collections",
        isRead: false, createdAt: minsAgo(120),
      },
      {
        targetType: "ADMIN", targetId: admin.id,
        triggerEvent: "GRIEVANCE_RAISED", channel: "IN_APP", status: "PENDING",
        title: "New Grievance Ticket",
        contentRendered: "Ticket #GRV-0042 raised by Mohan Lal: Payment deducted but not reflected.",
        linkUrl: "/grievances",
        isRead: false, createdAt: minsAgo(180),
      },
      {
        targetType: "ADMIN", targetId: admin.id,
        triggerEvent: "LOAN_DISBURSED", channel: "IN_APP", status: "SENT",
        title: "Loan Disbursed",
        contentRendered: "₹2,50,000 disbursed to Kavya Nair for loan #LN-2025-007.",
        linkUrl: "/loan",
        isRead: true, sentAt: minsAgo(300), createdAt: minsAgo(300),
      },
      {
        targetType: "ADMIN", targetId: admin.id,
        triggerEvent: "NPA_FLAGGED", channel: "IN_APP", status: "SENT",
        title: "NPA Classification Alert",
        contentRendered: "Loan #LN-2024-055 crossed 90 DPD and has been classified as NPA.",
        linkUrl: "/npa",
        isRead: true, sentAt: minsAgo(480), createdAt: minsAgo(480),
      },
      {
        targetType: "ADMIN", targetId: admin.id,
        triggerEvent: "SYSTEM", channel: "IN_APP", status: "SENT",
        title: "Day-End Closing Complete",
        contentRendered: "Day-end reconciliation completed successfully. Total collected: ₹8,42,500.",
        linkUrl: "/reconciliation",
        isRead: true, sentAt: minsAgo(720), createdAt: minsAgo(720),
      },

      // ── Rajesh Kumar (Finance Manager) notifications ─────────
      {
        targetType: "EMPLOYEE", targetId: empRajesh.id,
        triggerEvent: "APPROVAL_PENDING", channel: "IN_APP", status: "PENDING",
        title: "Loan Awaiting Your Approval",
        contentRendered: "Loan application #LN-2025-012 for Arun Tiwari is pending your approval.",
        linkUrl: "/loan-applications",
        isRead: false, createdAt: minsAgo(10),
      },
      {
        targetType: "EMPLOYEE", targetId: empRajesh.id,
        triggerEvent: "PAYMENT_RECEIVED", channel: "IN_APP", status: "PENDING",
        title: "Payment Confirmed",
        contentRendered: "EMI of ₹8,750 received for loan #LN-2024-091 from Pradeep Shah.",
        linkUrl: "/loan/payments",
        isRead: false, createdAt: minsAgo(35),
      },
      {
        targetType: "EMPLOYEE", targetId: empRajesh.id,
        triggerEvent: "COLLECTION_ASSIGNED", channel: "IN_APP", status: "PENDING",
        title: "Collection Case Assigned",
        contentRendered: "Collection case for loan #LN-2024-077 (Suresh Babu) assigned to you.",
        linkUrl: "/collections",
        isRead: false, createdAt: minsAgo(90),
      },
      {
        targetType: "EMPLOYEE", targetId: empRajesh.id,
        triggerEvent: "SYSTEM", channel: "IN_APP", status: "SENT",
        title: "Monthly Target Update",
        contentRendered: "You have collected ₹12.4L out of ₹18L target for May 2025.",
        linkUrl: "/dashboard",
        isRead: true, sentAt: minsAgo(600), createdAt: minsAgo(600),
      },

      // ── Priya Sharma (Sales Executive) notifications ─────────
      {
        targetType: "EMPLOYEE", targetId: empPriya.id,
        triggerEvent: "LEAD_ASSIGNED", channel: "IN_APP", status: "PENDING",
        title: "New Lead Assigned",
        contentRendered: "Partner lead from Mehta Motors assigned to you. Contact: 9876543210.",
        linkUrl: "/partners",
        isRead: false, createdAt: minsAgo(15),
      },
      {
        targetType: "EMPLOYEE", targetId: empPriya.id,
        triggerEvent: "KYC_SUBMITTED", channel: "IN_APP", status: "PENDING",
        title: "KYC Submitted by Applicant",
        contentRendered: "Ananya Krishnan has completed KYC for her loan application.",
        linkUrl: "/kyc",
        isRead: false, createdAt: minsAgo(55),
      },

      // ── Sneha Joshi (Support Agent) notifications ─────────────
      {
        targetType: "EMPLOYEE", targetId: empSneha.id,
        triggerEvent: "GRIEVANCE_ASSIGNED", channel: "IN_APP", status: "PENDING",
        title: "Grievance Assigned to You",
        contentRendered: "Ticket #GRV-0039 (Interest Overcharge Complaint) assigned for resolution.",
        linkUrl: "/grievances",
        isRead: false, createdAt: minsAgo(20),
      },
      {
        targetType: "EMPLOYEE", targetId: empSneha.id,
        triggerEvent: "GRIEVANCE_ESCALATED", channel: "IN_APP", status: "PENDING",
        title: "Grievance Escalated",
        contentRendered: "Ticket #GRV-0031 has breached SLA and been escalated to senior support.",
        linkUrl: "/grievances",
        isRead: false, createdAt: minsAgo(110),
      },

      // ── Amit & Vikram (background read notifications) ─────────
      {
        targetType: "EMPLOYEE", targetId: empAmit.id,
        triggerEvent: "LOAN_APPROVED", channel: "IN_APP", status: "SENT",
        title: "Your Loan Application Approved",
        contentRendered: "Loan application #LN-2025-009 you submitted has been approved.",
        linkUrl: "/loan-applications",
        isRead: true, sentAt: minsAgo(240), createdAt: minsAgo(240),
      },
      {
        targetType: "EMPLOYEE", targetId: empVikram.id,
        triggerEvent: "OVERDUE_ALERT", channel: "IN_APP", status: "PENDING",
        title: "Overdue Follow-up Reminder",
        contentRendered: "3 borrowers in your portfolio have not paid for 15+ days. Follow up today.",
        linkUrl: "/collections",
        isRead: false, createdAt: minsAgo(30),
      },
    ],
  });

  console.log("✅ Notifications seeded.");

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n========================================");
  console.log("🎉 SEEDING COMPLETE!");
  console.log("========================================\n");
  console.log("🔑 LOGIN CREDENTIALS:");
  console.log("----------------------------------------");
  console.log("👑 ADMIN");
  console.log("   Email   : admin@finance.com");
  console.log("   Password: Admin@1234");
  console.log("");
  console.log("👨‍💼 EMPLOYEES (all use password: Employee@1234)");
  console.log("   1. Rajesh Kumar (Finance Manager)");
  console.log("      Email: rajesh.kumar@finance.com");
  console.log("   2. Priya Sharma (Sales Executive)");
  console.log("      Email: priya.sharma@finance.com");
  console.log("   3. Amit Patel (Sales Executive)");
  console.log("      Email: amit.patel@finance.com");
  console.log("   4. Sneha Joshi (Support Agent)");
  console.log("      Email: sneha.joshi@finance.com");
  console.log("   5. Vikram Singh (Finance Manager)");
  console.log("      Email: vikram.singh@finance.com");
  console.log("========================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
