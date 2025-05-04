const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const companyName = process.env.COMPANY_NAME?.toLowerCase() || "example";
  const adminEmail = `admin@${companyName}.com`;
  const hashedPassword = await bcrypt.hash("Admin@1234", 10);

  // Upsert admin user
  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "admin",
      email: adminEmail,
      password: hashedPassword,
    },
  });

  // Idempotent seeding for photo ID types
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
  ];

  await Promise.all(
    photoIdTypes.map((idType) =>
      prisma.photoIdType.upsert({
        where: { name: idType.name },
        update: {},
        create: idType,
      })
    )
  );
}

main()
  .then(() => {
    console.log("Seeding done.");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
