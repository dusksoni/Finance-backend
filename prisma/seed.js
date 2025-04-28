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
  await prisma.photoIdType.createMany({
    data: [
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
        validation: "^[A-Z]{2}[0-9]{2}\\s?[0-9]{11}$", // Update if your format differs
      },
    ],
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
