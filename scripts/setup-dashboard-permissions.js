const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Setup script for Enhanced Dashboard permissions
 * Run this after deploying the enhanced dashboard to set up required permissions
 *
 * Usage: node scripts/setup-dashboard-permissions.js
 */

async function setupDashboardPermissions() {
  console.log("🚀 Setting up Enhanced Dashboard permissions...\n");

  try {
    // Check if Role model exists and has permissions field
    const roles = await prisma.role.findMany({
      select: { id: true, name: true, permissions: true },
    });

    console.log(`Found ${roles.length} roles in the system\n`);

    // Define dashboard permissions
    const dashboardPermissions = [
      "DASHBOARD_ORG_VIEW",
      "DASHBOARD_BRANCH_VIEW",
      "DASHBOARD_VIEW_ALL",
    ];

    console.log("📋 Dashboard Permissions:");
    console.log("  - DASHBOARD_ORG_VIEW: View organization-wide dashboard data");
    console.log("  - DASHBOARD_BRANCH_VIEW: View branch-level dashboard data");
    console.log("  - DASHBOARD_VIEW_ALL: Full access to all dashboard features\n");

    // Suggested role mappings
    const roleMappings = [
      {
        roleNames: ["CEO", "Managing Director", "Director", "Admin"],
        permissions: ["DASHBOARD_ORG_VIEW", "DASHBOARD_VIEW_ALL"],
        description: "Organization-wide access",
      },
      {
        roleNames: ["Branch Manager", "Branch Head", "Regional Manager"],
        permissions: ["DASHBOARD_BRANCH_VIEW"],
        description: "Branch-level access",
      },
      {
        roleNames: ["Senior Manager", "Manager", "Team Lead"],
        permissions: ["DASHBOARD_BRANCH_VIEW"],
        description: "Branch-level access",
      },
    ];

    console.log("💡 Suggested Role Mappings:\n");
    roleMappings.forEach((mapping, index) => {
      console.log(`${index + 1}. ${mapping.description}`);
      console.log(`   Roles: ${mapping.roleNames.join(", ")}`);
      console.log(`   Permissions: ${mapping.permissions.join(", ")}`);
      console.log("");
    });

    console.log("Would you like to apply these permissions? (This is a dry run)\n");

    // Show what would be updated for each existing role
    console.log("📊 Current Roles and Suggested Updates:\n");

    for (const role of roles) {
      const existingPermissions = role.permissions || [];
      let suggestedPermissions = [];
      let reasoning = "No dashboard permissions recommended";

      // Find matching role mapping
      for (const mapping of roleMappings) {
        if (mapping.roleNames.some((name) =>
          role.name.toLowerCase().includes(name.toLowerCase())
        )) {
          suggestedPermissions = mapping.permissions;
          reasoning = mapping.description;
          break;
        }
      }

      // Check if role already has dashboard permissions
      const hasDashboardPerms = existingPermissions.some((perm) =>
        dashboardPermissions.includes(perm)
      );

      console.log(`Role: ${role.name}`);
      console.log(`  Current permissions: ${existingPermissions.length} total`);
      console.log(`  Dashboard permissions: ${hasDashboardPerms ? "✓ Already configured" : "⚠ Not configured"}`);

      if (suggestedPermissions.length > 0) {
        const newPerms = suggestedPermissions.filter(
          (perm) => !existingPermissions.includes(perm)
        );

        if (newPerms.length > 0) {
          console.log(`  Suggested: Add ${newPerms.join(", ")} (${reasoning})`);
        } else {
          console.log(`  Status: Already has recommended permissions`);
        }
      } else {
        console.log(`  Suggested: No changes (${reasoning})`);
      }
      console.log("");
    }

    console.log("\n⚠️  DRY RUN MODE - No changes were made");
    console.log("\nTo apply permissions manually, use Prisma Studio or run SQL:");
    console.log("\nExample SQL to add permissions to a role:");
    console.log("```sql");
    console.log("UPDATE \"Role\"");
    console.log("SET permissions = array_cat(permissions, ARRAY['DASHBOARD_ORG_VIEW'])");
    console.log("WHERE name = 'CEO' AND NOT ('DASHBOARD_ORG_VIEW' = ANY(permissions));");
    console.log("```\n");

    console.log("Or update via Prisma:");
    console.log("```javascript");
    console.log("await prisma.role.update({");
    console.log("  where: { name: 'CEO' },");
    console.log("  data: {");
    console.log("    permissions: {");
    console.log("      push: ['DASHBOARD_ORG_VIEW', 'DASHBOARD_VIEW_ALL']");
    console.log("    }");
    console.log("  }");
    console.log("});");
    console.log("```\n");

    console.log("✅ Setup analysis complete!\n");
    console.log("Next steps:");
    console.log("1. Review the suggested permissions above");
    console.log("2. Apply permissions to roles using Prisma Studio or SQL");
    console.log("3. Test dashboard access with different user roles");
    console.log("4. Run the database indexes: psql -d your_db -f prisma/migrations/add_dashboard_indexes.sql");

  } catch (error) {
    console.error("❌ Error setting up dashboard permissions:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the setup
setupDashboardPermissions();
