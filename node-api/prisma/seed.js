const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("Admin@1234", 10);

  await prisma.admin.create({
    data: {
      name: "admin",
      email: "admin@kushalfinance.com",
      password: hashedPassword,
    },
  });
  await prisma.role.createMany({
    data: [
      {
        name: "FINANCE_MANAGER",
        description: "Can access everything",
        permissions: ["USER_VIEW", "USER_EDIT", "LOAN_CREATE", "PAYMENT_MANAGE"]
      },
      {
        name: "RECOVERY_AGENT",
        description: "Only access to user list and payment updates",
        permissions: ["USER_VIEW", "PAYMENT_MANAGE"]
      }
    ]
  });
}

main()
  .then(() => {
    console.log("Seeding done.");
    prisma.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
