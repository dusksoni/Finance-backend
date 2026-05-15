// Dev/testing seed — dummy admin, employees, roles, and notifications.
// DO NOT run on a client/production install.
// Safe to re-run (clears and recreates test data only).

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("Admin@1234", 10);
  const employeePassword = await bcrypt.hash("Employee@1234", 10);

  // ── Wipe only dev-created transactional data ───────────────
  console.log("🧹 Clearing dev data...");
  await prisma.notificationLog.deleteMany({});
  await prisma.loginActivity.deleteMany({});
  await prisma.actionLog.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.admin.deleteMany({});
  console.log("✅ Dev data cleared.");

  // ── Admin ──────────────────────────────────────────────────
  const admin = await prisma.admin.create({
    data: { name: "Super Admin", email: "admin@finance.com", password: hashedPassword },
  });
  console.log("✅ Admin: admin@finance.com / Admin@1234");

  // ── Roles ──────────────────────────────────────────────────
  const financeManagerRole = await prisma.role.create({
    data: {
      name: "Finance Manager",
      description: "Manages loans, payments, verifications, and approvals",
      permissions: [
        "USER_CREATE", "USER_EDIT", "USER_BLOCK", "USER_ACTIVITY_VIEW", "USER_ALL_VIEW",
        "EMPLOYEE_ACTIVITY_VIEW", "EMPLOYEE_LOGIN_HISTORY_VIEW", "EMPLOYEE_ALL_VIEW",
        "LOAN_ALL_VIEW", "LOAN_CREATE", "LOAN_EDIT", "LOAN_APPROVE", "LOAN_CLOSE",
        "PAYMENT_ALL_VIEW", "PAYMENT_CREATE", "PAYMENT_EDIT", "PAYMENT_VERIFY",
        "KYC_VIEW", "KYC_LIST_VIEW", "KYC_APPROVE",
        "COLLECTION_MANAGE", "COLLECTION_VIEW",
        "FORECLOSE_VIEW", "FORECLOSE_VERIFY",
        "SEIZED_ALL_VIEW", "SEIZED_VIEW", "SEIZED_CREATE", "SEIZED_EDIT", "SEIZED_COMPLETE", "SEIZED_CLOSE", "SEIZED_RELEASE",
        "MASTER_VEHICLE_CREATE", "MASTER_VEHICLE_EDIT", "MASTER_VEHICLE_ALL_VIEW",
        "MASTER_AGRICULTURE_CREATE", "MASTER_AGRICULTURE_EDIT", "MASTER_AGRICULTURE_ALL_VIEW",
        "MASTER_BRANCH_CREATE", "MASTER_BRANCH_EDIT", "MASTER_BRANCH_ALL_VIEW",
        "REGION_CREATE", "REGION_EDIT", "REGION_ALL_VIEW",
        "LOANTYPE_CREATE", "LOANTYPE_EDIT", "LOANTYPE_ALL_VIEW",
        "TERMINATION_CREATE", "TERMINATION_ALL_VIEW",
        "DASHBOARD_VIEW_ALL", "DASHBOARD_ORG_VIEW",
      ],
    },
  });

  const salesExecutiveRole = await prisma.role.create({
    data: {
      name: "Sales Executive",
      description: "Creates users, initiates loans and records payments",
      permissions: [
        "USER_ALL_VIEW", "USER_CREATE", "USER_EDIT", "USER_ACTIVITY_VIEW",
        "LOAN_ALL_VIEW", "LOAN_CREATE", "LOAN_EDIT",
        "PAYMENT_ALL_VIEW", "PAYMENT_CREATE",
        "FORECLOSE_VIEW",
        "SEIZED_VIEW",
        "DASHBOARD_BRANCH_VIEW",
      ],
    },
  });

  const supportAgentRole = await prisma.role.create({
    data: {
      name: "Support Agent",
      description: "Handles grievances and read-only support access",
      permissions: [
        "USER_ACTIVITY_VIEW", "USER_ALL_VIEW",
        "PAYMENT_ALL_VIEW",
        "GRIEVANCE_MANAGE", "GRIEVANCE_VIEW",
        "SEIZED_VIEW",
        "FORECLOSE_VIEW",
        "DASHBOARD_BRANCH_VIEW",
      ],
    },
  });
  console.log("✅ Roles created.");

  // ── Employees ──────────────────────────────────────────────
  const empRajesh = await prisma.employee.create({
    data: { name: "Rajesh Kumar",  email: "rajesh.kumar@finance.com",  password: employeePassword, roleId: financeManagerRole.id, adminId: admin.id },
  });
  const empPriya = await prisma.employee.create({
    data: { name: "Priya Sharma",  email: "priya.sharma@finance.com",  password: employeePassword, roleId: salesExecutiveRole.id,  adminId: admin.id },
  });
  const empAmit = await prisma.employee.create({
    data: { name: "Amit Patel",    email: "amit.patel@finance.com",    password: employeePassword, roleId: salesExecutiveRole.id,  adminId: admin.id },
  });
  const empSneha = await prisma.employee.create({
    data: { name: "Sneha Joshi",   email: "sneha.joshi@finance.com",   password: employeePassword, roleId: supportAgentRole.id,    adminId: admin.id },
  });
  const empVikram = await prisma.employee.create({
    data: { name: "Vikram Singh",  email: "vikram.singh@finance.com",  password: employeePassword, roleId: financeManagerRole.id,  adminId: admin.id },
  });
  console.log("✅ Employees created.");

  // ── Notifications ──────────────────────────────────────────
  const now = new Date();
  const minsAgo = (m) => new Date(now - m * 60 * 1000);

  await prisma.notificationLog.createMany({
    data: [
      { targetType: "ADMIN",    targetId: admin.id,     triggerEvent: "LOAN_APPROVED",      channel: "IN_APP", status: "PENDING", title: "Loan Approved",             contentRendered: "Loan #LN-2025-001 for Ramesh Verma has been approved by Rajesh Kumar.",        linkUrl: "/loan-applications",      isRead: false, createdAt: minsAgo(5)   },
      { targetType: "ADMIN",    targetId: admin.id,     triggerEvent: "PAYMENT_RECEIVED",   channel: "IN_APP", status: "PENDING", title: "Payment Received",          contentRendered: "EMI payment of ₹12,500 received for loan #LN-2025-003 via UPI.",             linkUrl: "/loan/payments",          isRead: false, createdAt: minsAgo(18)  },
      { targetType: "ADMIN",    targetId: admin.id,     triggerEvent: "KYC_SUBMITTED",      channel: "IN_APP", status: "PENDING", title: "KYC Pending Review",        contentRendered: "Sunita Devi has submitted KYC documents. Verification pending.",              linkUrl: "/kyc",                    isRead: false, createdAt: minsAgo(42)  },
      { targetType: "ADMIN",    targetId: admin.id,     triggerEvent: "FORECLOSE_REQUEST",  channel: "IN_APP", status: "PENDING", title: "Foreclosure Request",       contentRendered: "Pre-closure request raised for loan #LN-2024-088. Amount: ₹1,45,000.",       linkUrl: "/loan/approvals/foreclose", isRead: false, createdAt: minsAgo(75)  },
      { targetType: "ADMIN",    targetId: admin.id,     triggerEvent: "OVERDUE_ALERT",      channel: "IN_APP", status: "PENDING", title: "Overdue EMIs — Action Required", contentRendered: "5 loans have EMIs overdue by more than 30 days. Review collection cases.", linkUrl: "/collections",            isRead: false, createdAt: minsAgo(120) },
      { targetType: "ADMIN",    targetId: admin.id,     triggerEvent: "GRIEVANCE_RAISED",   channel: "IN_APP", status: "PENDING", title: "New Grievance Ticket",      contentRendered: "Ticket #GRV-0042 raised by Mohan Lal: Payment deducted but not reflected.", linkUrl: "/grievances",             isRead: false, createdAt: minsAgo(180) },
      { targetType: "ADMIN",    targetId: admin.id,     triggerEvent: "LOAN_DISBURSED",     channel: "IN_APP", status: "SENT",    title: "Loan Disbursed",            contentRendered: "₹2,50,000 disbursed to Kavya Nair for loan #LN-2025-007.",                  linkUrl: "/loan",                   isRead: true,  sentAt: minsAgo(300), createdAt: minsAgo(300) },
      { targetType: "ADMIN",    targetId: admin.id,     triggerEvent: "NPA_FLAGGED",        channel: "IN_APP", status: "SENT",    title: "NPA Classification Alert",  contentRendered: "Loan #LN-2024-055 crossed 90 DPD and has been classified as NPA.",          linkUrl: "/npa",                    isRead: true,  sentAt: minsAgo(480), createdAt: minsAgo(480) },
      { targetType: "EMPLOYEE", targetId: empRajesh.id, triggerEvent: "APPROVAL_PENDING",   channel: "IN_APP", status: "PENDING", title: "Loan Awaiting Your Approval", contentRendered: "Loan application #LN-2025-012 for Arun Tiwari is pending your approval.",  linkUrl: "/loan-applications",      isRead: false, createdAt: minsAgo(10)  },
      { targetType: "EMPLOYEE", targetId: empRajesh.id, triggerEvent: "PAYMENT_RECEIVED",   channel: "IN_APP", status: "PENDING", title: "Payment Confirmed",         contentRendered: "EMI of ₹8,750 received for loan #LN-2024-091 from Pradeep Shah.",           linkUrl: "/loan/payments",          isRead: false, createdAt: minsAgo(35)  },
      { targetType: "EMPLOYEE", targetId: empRajesh.id, triggerEvent: "COLLECTION_ASSIGNED",channel: "IN_APP", status: "PENDING", title: "Collection Case Assigned",  contentRendered: "Collection case for loan #LN-2024-077 (Suresh Babu) assigned to you.",     linkUrl: "/collections",            isRead: false, createdAt: minsAgo(90)  },
      { targetType: "EMPLOYEE", targetId: empPriya.id,  triggerEvent: "LEAD_ASSIGNED",      channel: "IN_APP", status: "PENDING", title: "New Lead Assigned",         contentRendered: "Partner lead from Mehta Motors assigned to you. Contact: 9876543210.",      linkUrl: "/partners",               isRead: false, createdAt: minsAgo(15)  },
      { targetType: "EMPLOYEE", targetId: empPriya.id,  triggerEvent: "KYC_SUBMITTED",      channel: "IN_APP", status: "PENDING", title: "KYC Submitted by Applicant",contentRendered: "Ananya Krishnan has completed KYC for her loan application.",               linkUrl: "/kyc",                    isRead: false, createdAt: minsAgo(55)  },
      { targetType: "EMPLOYEE", targetId: empSneha.id,  triggerEvent: "GRIEVANCE_ASSIGNED", channel: "IN_APP", status: "PENDING", title: "Grievance Assigned to You", contentRendered: "Ticket #GRV-0039 (Interest Overcharge Complaint) assigned for resolution.", linkUrl: "/grievances",             isRead: false, createdAt: minsAgo(20)  },
      { targetType: "EMPLOYEE", targetId: empSneha.id,  triggerEvent: "GRIEVANCE_ESCALATED",channel: "IN_APP", status: "PENDING", title: "Grievance Escalated",       contentRendered: "Ticket #GRV-0031 has breached SLA and been escalated to senior support.",  linkUrl: "/grievances",             isRead: false, createdAt: minsAgo(110) },
      { targetType: "EMPLOYEE", targetId: empVikram.id, triggerEvent: "OVERDUE_ALERT",      channel: "IN_APP", status: "PENDING", title: "Overdue Follow-up Reminder",contentRendered: "3 borrowers in your portfolio have not paid for 15+ days. Follow up today.",linkUrl: "/collections",            isRead: false, createdAt: minsAgo(30)  },
    ],
  });
  console.log("✅ Notifications seeded.");

  console.log("\n========================================");
  console.log("🎉 DEV SEED COMPLETE");
  console.log("========================================");
  console.log("👑 ADMIN       admin@finance.com         Admin@1234");
  console.log("👨‍💼 rajesh.kumar@finance.com  (Finance Manager)  Employee@1234");
  console.log("👨‍💼 priya.sharma@finance.com  (Sales Executive)  Employee@1234");
  console.log("👨‍💼 amit.patel@finance.com    (Sales Executive)  Employee@1234");
  console.log("👨‍💼 sneha.joshi@finance.com   (Support Agent)    Employee@1234");
  console.log("👨‍💼 vikram.singh@finance.com  (Finance Manager)  Employee@1234");
  console.log("========================================\n");
}

main()
  .catch((e) => { console.error("❌ Dev seed failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
