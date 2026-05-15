const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const permissionGroups = [
  {
    name: "User Management",
    permissions: [
      { name: "USER_ALL_VIEW", label: "View All Users", type: "read" },
      { name: "USER_LOAN_VIEW", label: "View User Loans", type: "read" },
      { name: "USER_DEFAULTER_ALL_VIEW", label: "View All Defaulters", type: "read" },
      { name: "USER_ACTIVITY_VIEW", label: "View User Activity", type: "read" },
      { name: "USER_CREATE", label: "Create User", type: "create" },
      { name: "USER_EDIT", label: "Edit User", type: "update" },
      { name: "USER_BLOCK", label: "Block/Unblock User", type: "update" },
    ],
  },
  {
    name: "Employee Management",
    permissions: [
      { name: "EMPLOYEE_ALL_VIEW", label: "View All Employees", type: "read" },
      { name: "EMPLOYEE_ACTIVITY_VIEW", label: "View Employee Activity", type: "read" },
      { name: "EMPLOYEE_LOGIN_HISTORY_VIEW", label: "View Employee Login History", type: "read" },
      { name: "EMPLOYEE_CREATE", label: "Create Employee", type: "create" },
      { name: "EMPLOYEE_EDIT", label: "Edit Employee", type: "update" },
      { name: "EMPLOYEE_EDIT_PASSWORD", label: "Edit Employee Password", type: "update" },
      { name: "EMPLOYEE_BLOCK", label: "Block Employee", type: "update" },
      { name: "EMPLOYEE_DELETE", label: "Delete Employee", type: "delete" },
    ],
  },
  {
    name: "Role Management",
    permissions: [
      { name: "ROLE_ALL_VIEW", label: "View All Roles", type: "read" },
      { name: "ROLE_CREATE", label: "Create Role", type: "create" },
      { name: "ROLE_EDIT", label: "Edit Role", type: "update" },
      { name: "ROLE_DELETE", label: "Delete Role", type: "delete" },
    ],
  },
  {
    name: "Loan Management",
    permissions: [
      { name: "LOAN_ALL_VIEW", label: "View All Loans", type: "read" },
      { name: "LOAN_CREATE", label: "Create Loan", type: "create" },
      { name: "LOAN_EDIT", label: "Edit Loan", type: "update" },
      { name: "LOAN_CLOSE", label: "Close Loan", type: "update" },
      { name: "LOAN_APPROVE", label: "Approve Loan", type: "update" },
    ],
  },
  {
    name: "Loan Type Management",
    permissions: [
      { name: "LOANTYPE_ALL_VIEW", label: "View All Loan Types", type: "read" },
      { name: "LOANTYPE_CREATE", label: "Create Loan Type", type: "create" },
      { name: "LOANTYPE_EDIT", label: "Edit Loan Type", type: "update" },
      { name: "LOANTYPE_DELETE", label: "Delete Loan Type", type: "delete" },
    ],
  },
  {
    name: "Payment Management",
    permissions: [
      { name: "PAYMENT_ALL_VIEW", label: "View All Payments", type: "read" },
      { name: "PAYMENT_VIEW_BY_LOAN", label: "View Payments by Loan", type: "read" },
      { name: "PAYMENT_CREATE", label: "Create Payment", type: "create" },
      { name: "PAYMENT_EDIT", label: "Edit Payment", type: "update" },
      { name: "PAYMENT_VERIFY", label: "Verify Payment", type: "update" },
      { name: "PAYMENT_DELETE", label: "Delete Payment", type: "delete" },
    ],
  },
  {
    name: "Cease/Seized Management",
    permissions: [
      { name: "SEIZED_ALL_VIEW", label: "View All Seized", type: "read" },
      { name: "SEIZED_VIEW", label: "View Seized", type: "read" },
      { name: "SEIZED_VIEW_BY_LOAN", label: "View Seized by Loan", type: "read" },
      { name: "SEIZED_CREATE", label: "Create Seized", type: "create" },
      { name: "SEIZED_EDIT", label: "Edit Seized", type: "update" },
      { name: "SEIZED_COMPLETE", label: "Complete Seized", type: "update" },
      { name: "SEIZED_RELEASE", label: "Release Seized", type: "update" },
      { name: "SEIZED_CLOSE", label: "Close Seized", type: "update" },
      { name: "SEIZED_CONTACT_ADD", label: "Add Seized Contact Attempt", type: "create" },
      { name: "SEIZED_DELETE", label: "Delete Seized", type: "delete" },
    ],
  },
  {
    name: "Foreclosure Management",
    permissions: [
      { name: "FORECLOSE_VIEW", label: "View Foreclosure", type: "read" },
      { name: "FORECLOSE_CREATE", label: "Create Foreclosure", type: "create" },
      { name: "FORECLOSE_EDIT", label: "Edit Foreclosure", type: "update" },
      { name: "FORECLOSE_VERIFY", label: "Approve Foreclosure Requests", type: "update" },
    ],
  },
  {
    name: "KYC Management",
    permissions: [
      { name: "KYC_VIEW", label: "View KYC Records", type: "read" },
      { name: "KYC_LIST_VIEW", label: "View KYC List", type: "read" },
      { name: "KYC_APPROVE", label: "Approve KYC", type: "update" },
      { name: "KYC_REJECT", label: "Reject KYC", type: "update" },
      { name: "KYC_DOCUMENT_VERIFY", label: "Verify KYC Document", type: "update" },
    ],
  },
  {
    name: "Collection Management",
    permissions: [
      { name: "COLLECTION_MANAGE", label: "Manage Collections", type: "update" },
      { name: "COLLECTION_VIEW", label: "View Collections", type: "read" },
      { name: "COLLECTION_ASSIGN", label: "Assign Collection Cases", type: "update" },
    ],
  },
  {
    name: "Grievance Management",
    permissions: [
      { name: "GRIEVANCE_MANAGE", label: "Manage Grievances", type: "update" },
      { name: "GRIEVANCE_VIEW", label: "View Grievances", type: "read" },
      { name: "GRIEVANCE_CREATE", label: "Create Grievance", type: "create" },
      { name: "GRIEVANCE_ASSIGN", label: "Assign Grievance", type: "update" },
    ],
  },
  {
    name: "Dashboard",
    permissions: [
      { name: "DASHBOARD_VIEW_ALL", label: "View Full Dashboard", type: "read" },
      { name: "DASHBOARD_ORG_VIEW", label: "View Org Dashboard", type: "read" },
      { name: "DASHBOARD_BRANCH_VIEW", label: "View Branch Dashboard", type: "read" },
    ],
  },
  {
    name: "Legal Actions",
    permissions: [
      { name: "LEGAL_ACTION_VIEW", label: "View Legal Actions", type: "read" },
      { name: "LEGAL_ACTION_CREATE", label: "Create Legal Action", type: "create" },
      { name: "LEGAL_ACTION_EDIT", label: "Edit Legal Action", type: "update" },
    ],
  },
  {
    name: "NACH / Mandate",
    permissions: [
      { name: "NACH_VIEW", label: "View NACH Mandates", type: "read" },
      { name: "NACH_CREATE", label: "Create NACH Mandate", type: "create" },
      { name: "NACH_EDIT", label: "Edit NACH Mandate", type: "update" },
      { name: "NACH_CANCEL", label: "Cancel NACH Mandate", type: "update" },
    ],
  },
  {
    name: "Collateral Management",
    permissions: [
      { name: "COLLATERAL_VIEW", label: "View Collateral", type: "read" },
      { name: "COLLATERAL_CREATE", label: "Create Collateral", type: "create" },
      { name: "COLLATERAL_EDIT", label: "Edit Collateral", type: "update" },
      { name: "COLLATERAL_VALUATE", label: "Add Collateral Valuation", type: "create" },
    ],
  },
  {
    name: "Restructuring",
    permissions: [
      { name: "RESTRUCTURING_VIEW", label: "View Restructuring", type: "read" },
      { name: "RESTRUCTURING_CREATE", label: "Create Restructuring", type: "create" },
      { name: "RESTRUCTURING_APPLY", label: "Apply Restructuring", type: "update" },
    ],
  },
  {
    name: "Location Management",
    permissions: [
      { name: "STATE_ALL_VIEW", label: "View All States", type: "read" },
      { name: "STATE_CREATE", label: "Create State", type: "create" },
      { name: "STATE_EDIT", label: "Edit State", type: "update" },
      { name: "STATE_DELETE", label: "Delete State", type: "delete" },
      { name: "CITY_ALL_VIEW", label: "View All Cities", type: "read" },
      { name: "CITY_CREATE", label: "Create City", type: "create" },
      { name: "CITY_EDIT", label: "Edit City", type: "update" },
      { name: "CITY_DELETE", label: "Delete City", type: "delete" },
      { name: "REGION_ALL_VIEW", label: "View All Regions", type: "read" },
      { name: "REGION_VIEW", label: "View Region", type: "read" },
      { name: "REGION_CREATE", label: "Create Region", type: "create" },
      { name: "REGION_EDIT", label: "Edit Region", type: "update" },
      { name: "REGION_DELETE", label: "Delete Region", type: "delete" },
    ],
  },
  {
    name: "Master Data Management",
    permissions: [
      { name: "MASTER_BRANCH_ALL_VIEW", label: "View Branch Master", type: "read" },
      { name: "MASTER_BRANCH_CREATE", label: "Create Branch", type: "create" },
      { name: "MASTER_BRANCH_EDIT", label: "Edit Branch", type: "update" },
      { name: "MASTER_BRANCH_DELETE", label: "Delete Branch", type: "delete" },
      { name: "MASTER_SHOWROOM_ALL_VIEW", label: "View Showroom Master", type: "read" },
      { name: "MASTER_SHOWROOM_CREATE", label: "Create Showroom", type: "create" },
      { name: "MASTER_SHOWROOM_EDIT", label: "Edit Showroom", type: "update" },
      { name: "MASTER_SHOWROOM_DELETE", label: "Delete Showroom", type: "delete" },
      { name: "MASTER_VEHICLE_ALL_VIEW", label: "View Vehicle Master", type: "read" },
      { name: "MASTER_VEHICLE_CREATE", label: "Create Vehicle Brand/Model", type: "create" },
      { name: "MASTER_VEHICLE_EDIT", label: "Edit Vehicle Brand/Model", type: "update" },
      { name: "MASTER_VEHICLE_DELETE", label: "Delete Vehicle Brand/Model", type: "delete" },
      { name: "MASTER_AGRICULTURE_ALL_VIEW", label: "View Agriculture Master", type: "read" },
      { name: "MASTER_AGRICULTURE_CREATE", label: "Create Equipment", type: "create" },
      { name: "MASTER_AGRICULTURE_EDIT", label: "Edit Equipment", type: "update" },
      { name: "MASTER_AGRICULTURE_DELETE", label: "Delete Equipment", type: "delete" },
    ],
  },
  {
    name: "Termination Management",
    permissions: [
      { name: "TERMINATION_ALL_VIEW", label: "View All Terminations", type: "read" },
      { name: "TERMINATION_CREATE", label: "Create Termination", type: "create" },
      { name: "TERMINATION_EDIT", label: "Edit Termination", type: "update" },
    ],
  },
  {
    name: "Photo ID Type Management",
    permissions: [
      { name: "PHOTOID_ALL_VIEW", label: "View All Photo ID Types", type: "read" },
      { name: "PHOTOID_CREATE", label: "Create Photo ID Type", type: "create" },
      { name: "PHOTOID_EDIT", label: "Edit Photo ID Type", type: "update" },
      { name: "PHOTOID_DELETE", label: "Delete Photo ID Type", type: "delete" },
    ],
  },
  {
    name: "Reports & Audit",
    permissions: [
      { name: "REPORT_VIEW", label: "View Reports", type: "read" },
      { name: "REPORT_DOWNLOAD", label: "Download Reports", type: "read" },
      { name: "AUDIT_VIEW", label: "View Audit Logs", type: "read" },
      { name: "NPA_REPORT_VIEW", label: "View NPA Reports", type: "read" },
    ],
  },
  {
    name: "App Configuration",
    permissions: [
      { name: "ADMIN_CONFIG", label: "Manage App Configuration", type: "update" },
    ],
  },
];

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const group of permissionGroups) {
    for (const perm of group.permissions) {
      const result = await prisma.permission.upsert({
        where: { name: perm.name },
        update: { label: perm.label, group: group.name, type: perm.type },
        create: { name: perm.name, label: perm.label, group: group.name, type: perm.type },
      });
      if (result) inserted++;
    }
  }

  console.log(`✅ Done! ${inserted} permissions upserted across ${permissionGroups.length} groups.`);
}

main()
  .catch((e) => { console.error("❌ Failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
