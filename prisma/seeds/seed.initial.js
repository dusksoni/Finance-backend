// Initial launch seed — run once on every new client install.
// Seeds: admin account, reference data (genders, states, cities, photo IDs), and permissions.
// All steps use upsert — safe to re-run without duplicating data.

const { execSync } = require("child_process");
const path = require("path");

const steps = [
  { label: "Reference data (admin, genders, states, cities, photo IDs)", file: "initial/01_reference.js" },
  { label: "Permissions",                                                  file: "initial/02_permissions.js" },
];

(async () => {
  console.log("\n🚀 Running INITIAL LAUNCH seed...\n");

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
  console.log("✅ INITIAL SEED COMPLETE");
  console.log("   Database is ready for client use.");
  console.log("   For full city data: npm run seed:cities");
  console.log("========================================\n");
})();
