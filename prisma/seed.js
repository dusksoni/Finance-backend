const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const companyName = process.env.COMPANY_NAME?.toLowerCase() || "example";
  const adminEmail = `admin@${companyName}.com`;
  const hashedPassword = await bcrypt.hash("Admin@1234", 10);

  // Admin creation
  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "admin",
      email: adminEmail,
      password: hashedPassword,
    },
  });

  // Genders
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

  // Address Categories
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

  // States
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

  // Photo ID Types
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

  // Relation Types
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

  // 💳 Loan Types
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
        update: {
          label: lt.label,
          description: lt.description,
          rules: lt.rules,
        },
        create: lt,
      })
    )
  );

  console.log("✅ Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
