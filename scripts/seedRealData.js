/**
 * seedRealData.js — Creates real borrowers, loans, payments via Prisma directly,
 * then fires notifications via the live API (which triggers WebSocket push).
 * Run: node scripts/seedRealData.js
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const axios = require("axios");

const prisma = new PrismaClient();
const BASE = "http://localhost:3001/api";
let TOKEN = "";
const api = axios.create({ baseURL: BASE });
api.interceptors.request.use((c) => { if (TOKEN) c.headers.Authorization = `Bearer ${TOKEN}`; return c; });

const ok  = (msg) => console.log(`✅ ${msg}`);
const log = (msg) => console.log(`   ${msg}`);
const section = (msg) => console.log(`\n${msg}`);

async function notify(targetType, targetId, triggerEvent, title, content, linkUrl) {
  const res = await api.post("/notifications", { targetType, targetId, triggerEvent, title, content, linkUrl })
    .catch(e => ({ data: e.response?.data }));
  const id = res.data?.data?.id || res.data?.id;
  if (id) ok(`Notification → ${targetType === "ADMIN" ? "Admin" : "Employee"}: "${title}"`);
  else log(`Notification failed: ${JSON.stringify(res.data)?.slice(0, 100)}`);
}

async function run() {
  // ── 1. Login to get token & admin ID ─────────────────────────────────────
  section("🔐 Logging in...");
  const loginRes = await api.post("/admin/login", { email: "admin@finance.com", password: "Admin@1234" });
  TOKEN = loginRes.data.data.token;
  const meRes = await api.get("/admin/me");
  const ADMIN_ID = meRes.data.data.id;
  ok(`Admin: ${meRes.data.data.name} (${ADMIN_ID.slice(0,8)})`);

  // ── 2. Get reference data ─────────────────────────────────────────────────
  section("📋 Fetching reference IDs...");

  const state = await prisma.state.findFirst({ where: { name: { contains: "Maharashtra", mode: "insensitive" } }})
    || await prisma.state.findFirst();
  const city = await prisma.city.findFirst({ where: { stateId: state.id }});
  const addrCategory = await prisma.addressCategory.findFirst({ where: { value: "01" } })
    || await prisma.addressCategory.findFirst();
  const gender = await prisma.gender.findFirst({ where: { value: "02" }}); // Male
  const genderF = await prisma.gender.findFirst({ where: { value: "01" }}); // Female
  const twoWheelerType = await prisma.loanType.findFirst({ where: { name: "TWOWHEELER" }});
  const agriType = await prisma.loanType.findFirst({ where: { name: "AGRICULTURE" }});
  const photoIdType = await prisma.photoIdType.findFirst();
  const employees = await prisma.employee.findMany({ take: 5 });
  const rajesh = employees.find(e => e.email.includes("rajesh")) || employees[0];
  const priya  = employees.find(e => e.email.includes("priya"))  || employees[1];
  const sneha  = employees.find(e => e.email.includes("sneha"))  || employees[2];

  log(`State: ${state.name}, City: ${city?.name}`);
  log(`LoanTypes: TW=${twoWheelerType?.id?.slice(0,8)}, Agri=${agriType?.id?.slice(0,8)}`);
  log(`Employees: Rajesh=${rajesh?.name}, Priya=${priya?.name}, Sneha=${sneha?.name}`);

  // ── 3. Create or get Region & Branch ─────────────────────────────────────
  section("🏢 Setting up region & branch...");

  let region = await prisma.region.findFirst({ where: { name: "Maharashtra Region" }});
  if (!region) {
    region = await prisma.region.create({ data: { name: "Maharashtra Region", stateId: state.id, cityId: city.id }});
    ok(`Region created: ${region.name}`);
  } else {
    ok(`Region exists: ${region.name}`);
  }

  let branch = await prisma.branch.findFirst({ where: { name: "Pune Main Branch" }});
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        name: "Pune Main Branch",
        address: "123 FC Road, Shivajinagar, Pune",
        phone: "9876500001", email: "pune@finance.com",
        regionId: region.id,
      },
    });
    ok(`Branch created: ${branch.name}`);
  } else {
    ok(`Branch exists: ${branch.name}`);
  }

  // ── 4. Create Borrowers ───────────────────────────────────────────────────
  section("👤 Creating borrowers...");

  const borrowerDefs = [
    { firstName: "Ramesh", lastName: "Verma",  phone: "9876511101", email: "ramesh.verma@gmail.com",  genderId: gender?.id,  dob: "1988-03-12" },
    { firstName: "Sunita", lastName: "Devi",   phone: "9876511102", email: "sunita.devi@gmail.com",   genderId: genderF?.id, dob: "1992-07-25" },
    { firstName: "Mohan",  lastName: "Sharma", phone: "9876511103", email: "mohan.sharma@gmail.com",  genderId: gender?.id,  dob: "1985-11-08" },
  ];

  const createdUsers = [];
  for (const b of borrowerDefs) {
    let user = await prisma.user.findFirst({ where: { phone: b.phone }});
    if (!user) {
      user = await prisma.user.create({
        data: {
          firstName: b.firstName, lastName: b.lastName,
          phone: b.phone, email: b.email,
          dateOfBirth: new Date(b.dob),
          ...(b.genderId ? { gender: { connect: { id: b.genderId } } } : {}),
          region: { connect: { id: region.id } },
          admin: { connect: { id: ADMIN_ID } },
          addresses: {
            create: [{
              address: "456 Main Street, Shivajinagar",
              country: "India",
              stateId: state.id,
              cityId: city.id,
              pincode: 411001,
              addressCategoryId: addrCategory.id,
            }],
          },
        },
      });
      ok(`Borrower created: ${user.firstName} ${user.lastName} (${user.id.slice(0,8)})`);
    } else {
      ok(`Borrower exists: ${user.firstName} ${user.lastName}`);
    }
    createdUsers.push(user);
  }

  // ── 5. Create Loans with EMI schedules ───────────────────────────────────
  section("💰 Creating loans with EMI schedules...");

  const loanDefs = [
    { user: createdUsers[0], type: twoWheelerType, amount: 85000,  tenure: 24, rate: 12, penalty: 2, purpose: "Purchase of Honda Activa 6G", assignedTo: rajesh },
    { user: createdUsers[1], type: agriType,       amount: 150000, tenure: 36, rate: 10, penalty: 2, purpose: "Purchase of Power Tiller",    assignedTo: priya  },
    { user: createdUsers[2], type: twoWheelerType, amount: 65000,  tenure: 18, rate: 13, penalty: 2, purpose: "Purchase of TVS Jupiter",     assignedTo: rajesh },
  ];

  const createdLoans = [];
  for (const def of loanDefs) {
    if (!def.type) { log(`Skipping loan — no loan type`); continue; }

    let loan = await prisma.loan.findFirst({ where: { userId: def.user.id, loanTypeId: def.type.id }});
    if (!loan) {
      // Calculate monthly EMI (reducing balance)
      const monthlyRate = def.rate / 100 / 12;
      const emiAmt = Math.round((def.amount * monthlyRate * Math.pow(1 + monthlyRate, def.tenure))
        / (Math.pow(1 + monthlyRate, def.tenure) - 1));
      const totalInterest = emiAmt * def.tenure - def.amount;
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + def.tenure);

      loan = await prisma.loan.create({
        data: {
          fileNo: `LN${Date.now()}${Math.floor(Math.random()*1000)}`,
          userId: def.user.id,
          loanTypeId: def.type.id,
          branchId: branch.id,
          principalLoanAmount: def.amount,
          interestAmount: totalInterest,
          totalAmount: def.amount + totalInterest,
          monthlyPayableAmount: emiAmt,
          pendingAmount: def.amount + totalInterest,
          interestRate: def.rate,
          penaltyPercentage: def.penalty,
          tenureMonths: def.tenure,
          startDate,
          endDate,
          fileStatus: "ACTIVE",
          comment: def.purpose,
          adminId: ADMIN_ID,
          employeeId: def.assignedTo?.id,
          emi: {
            create: Array.from({ length: def.tenure }, (_, i) => {
              const due = new Date();
              due.setMonth(due.getMonth() + i + 1);
              return {
                emiPayAmount: emiAmt,
                principalAmt: Math.round(def.amount / def.tenure),
                interestAmt: emiAmt - Math.round(def.amount / def.tenure),
                paymentFor: due,
                status: "UNPAID",
              };
            }),
          },
        },
        include: { emi: { take: 1 } },
      });
      ok(`Loan created: ${def.user.firstName} — ₹${def.amount.toLocaleString("en-IN")}, EMI ₹${emiAmt.toLocaleString("en-IN")}/mo (${loan.id.slice(0,8)})`);
    } else {
      ok(`Loan exists: ${def.user.firstName} — ₹${def.amount.toLocaleString("en-IN")}`);
    }
    createdLoans.push({ ...def, loan });
  }

  // ── 6. Record a payment on the first loan ────────────────────────────────
  section("💳 Recording a payment...");
  const firstLoan = createdLoans[0];
  if (firstLoan?.loan) {
    const firstEmi = await prisma.eMI.findFirst({
      where: { loanId: firstLoan.loan.id, status: "UNPAID" },
      orderBy: { paymentFor: "asc" },
    });
    if (firstEmi) {
      const emiAmt = Number(firstEmi.emiPayAmount);
      const payment = await prisma.payment.create({
        data: {
          loanId: firstLoan.loan.id,
          amount: emiAmt,
          paymentDate: new Date(),
          paymentMode: "UPI",
          transactionId: `UPI${Date.now()}`,
          status: "PAID",
          verified: true,
          verifiedAt: new Date(),
          emiId: firstEmi.id,
          adminId: ADMIN_ID,
        },
      });
      firstLoan.paymentId = payment.id;
      await prisma.eMI.update({ where: { id: firstEmi.id }, data: { status: "PAID" } });
      ok(`Payment recorded: ₹${emiAmt.toLocaleString("en-IN")} for ${firstLoan.user.firstName}'s loan`);
    }
  }

  // ── 7. Create a Grievance ─────────────────────────────────────────────────
  section("📝 Creating grievance...");
  let grievance = await prisma.grievanceTicket.findFirst({ where: { userId: createdUsers[0].id }}).catch(() => null);
  if (!grievance) {
    grievance = await prisma.grievanceTicket.create({
      data: {
        userId: createdUsers[0].id,
        loanId: createdLoans[0]?.loan?.id,
        branchId: branch.id,
        category: "PAYMENT",
        subject: "EMI deducted but not reflected in account",
        description: "I paid my May EMI via UPI on 10th but it still shows unpaid in the portal. Please check.",
        priority: "HIGH",
        status: "OPEN",
        ticketNumber: `GRV-${Date.now().toString().slice(-6)}`,
        createdByAdminId: ADMIN_ID,
      },
    }).catch(e => { log(`Grievance: ${e.message}`); return null; });
    if (grievance) ok(`Grievance created: ${grievance.ticketNumber}`);
  } else {
    ok(`Grievance exists: ${grievance.ticketNumber || grievance.id.slice(0,8)}`);
  }

  // ── 8. Fire Real Notifications via API (triggers WebSocket) ──────────────
  section("🔔 Firing real notifications via API (WebSocket push)...");

  // Loan application notifications
  for (const def of createdLoans) {
    await notify("ADMIN", ADMIN_ID, "LOAN_CREATED",
      "New Loan Application Submitted",
      `Loan of ₹${def.amount.toLocaleString("en-IN")} submitted for ${def.user.firstName} ${def.user.lastName}. Pending approval.`,
      `/loan/${def.loan.id}`
    );

    if (def.assignedTo?.id) {
      await notify("EMPLOYEE", def.assignedTo.id, "LOAN_ASSIGNED",
        "New Loan Assigned to You",
        `₹${def.amount.toLocaleString("en-IN")} loan for ${def.user.firstName} ${def.user.lastName} has been assigned to you for processing.`,
        `/loan/${def.loan.id}`
      );
    }
  }

  // Payment received notification
  if (firstLoan?.loan) {
    const emiDisplay = Math.round(firstLoan.loan.monthlyPayableAmount).toLocaleString("en-IN");
    const paymentLink = firstLoan.paymentId ? `/payment/${firstLoan.paymentId}` : `/loan/${firstLoan.loan.id}`;
    await notify("ADMIN", ADMIN_ID, "PAYMENT_RECEIVED",
      "EMI Payment Received",
      `EMI payment of ₹${emiDisplay} received from ${firstLoan.user.firstName} ${firstLoan.user.lastName} via UPI.`,
      paymentLink
    );
    if (firstLoan.assignedTo?.id) {
      await notify("EMPLOYEE", firstLoan.assignedTo.id, "PAYMENT_RECEIVED",
        "EMI Payment Confirmed",
        `${firstLoan.user.firstName} ${firstLoan.user.lastName} paid their May EMI of ₹${emiDisplay}.`,
        paymentLink
      );
    }
  }

  // Grievance notifications
  if (grievance) {
    await notify("ADMIN", ADMIN_ID, "GRIEVANCE_RAISED",
      `New HIGH Priority Grievance — ${grievance.ticketNumber || "GRV"}`,
      `${createdUsers[0].firstName} ${createdUsers[0].lastName}: "EMI deducted but not reflected in account". Requires urgent attention.`,
      `/grievances/${grievance.id}`
    );
    if (sneha?.id) {
      await notify("EMPLOYEE", sneha.id, "GRIEVANCE_ASSIGNED",
        "Grievance Assigned to You",
        `HIGH priority ticket: "${grievance.subject}" from ${createdUsers[0].firstName} assigned for resolution.`,
        `/grievances/${grievance.id}`
      );
    }
  }

  // KYC pending
  await notify("ADMIN", ADMIN_ID, "KYC_PENDING",
    "KYC Verification Required",
    `${createdUsers[1].firstName} ${createdUsers[1].lastName} has submitted documents for ₹${loanDefs[1]?.amount?.toLocaleString("en-IN")} loan. KYC pending.`,
    `/kyc/${createdUsers[1].id}`
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n========================================");
  console.log("🎉 DONE — Real data + notifications created");
  console.log("========================================");
  console.log(`  Branch  : ${branch.name}`);
  console.log(`  Borrowers: ${createdUsers.map(u => u.firstName).join(", ")}`);
  console.log(`  Loans   : ${createdLoans.length} active loans with EMI schedules`);
  if (grievance) console.log(`  Grievance: ${grievance.ticketNumber || grievance.id.slice(0,8)}`);
  console.log("  Check the 🔔 bell — notifications pushed via WebSocket");
  console.log("========================================\n");
}

run()
  .catch(e => { console.error("❌ Failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
