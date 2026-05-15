// Dev/testing seed — run during development to reset dummy data.
// Creates: test admin, employees, roles, notifications, users, loans, EMIs, payments.
// WARNING: clears dev-created data before seeding.
// DO NOT run on a client or production database.

const { execSync } = require("child_process");
const path = require("path");

const steps = [
  { label: "Dev data (admin, employees, roles, notifications)", file: "dev/01_dev_data.js" },
  { label: "Users, loan types, loans, EMIs, payments",         file: "dev/02_users_loans.js" },
];

(async () => {
  console.log("\n⚠️  Running DEV seed — this clears existing admin/employee/role data.\n");

  for (const step of steps) {
    console.log(`\n▶ ${step.label}`);
    try {
      execSync(`node "${path.join(__dirname, step.file)}"`, { stdio: "inherit" });
    } catch {
      console.error(`\n❌ Step failed: ${step.file}`);
      process.exit(1);
    }
  }

  console.log("\n========================================");
  console.log("✅ DEV SEED COMPLETE");
  console.log("   Reference/master data was not touched.");
  console.log("========================================\n");
})();
