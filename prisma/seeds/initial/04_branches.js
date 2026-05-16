// Seeds regions, branches, and showrooms.
// Requires 01_reference.js (states & cities) to have run first.
// Safe to re-run (upsert only).

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // ── Fetch required states ──────────────────────────────────────
  const [stateMP, stateMH, stateGJ, stateRJ, stateUP, stateTN, stateKA] = await Promise.all([
    prisma.state.findFirst({ where: { stateCode: "23" } }), // Madhya Pradesh
    prisma.state.findFirst({ where: { stateCode: "27" } }), // Maharashtra
    prisma.state.findFirst({ where: { stateCode: "24" } }), // Gujarat
    prisma.state.findFirst({ where: { stateCode: "08" } }), // Rajasthan
    prisma.state.findFirst({ where: { stateCode: "09" } }), // Uttar Pradesh
    prisma.state.findFirst({ where: { stateCode: "33" } }), // Tamil Nadu
    prisma.state.findFirst({ where: { stateCode: "29" } }), // Karnataka
  ]);

  if (!stateMP || !stateMH || !stateGJ || !stateRJ || !stateUP || !stateTN || !stateKA) {
    throw new Error("Required states not found — run 01_reference.js first.");
  }

  // ── Regions (one per key state cluster) ───────────────────────
  const regionDefs = [
    { name: "Central India Region",   stateId: stateMP.id },
    { name: "West India Region",      stateId: stateMH.id },
    { name: "Gujarat Region",         stateId: stateGJ.id },
    { name: "North India Region",     stateId: stateRJ.id },
    { name: "UP & East Region",       stateId: stateUP.id },
    { name: "South India Region",     stateId: stateTN.id },
    { name: "Karnataka Region",       stateId: stateKA.id },
  ];

  const regions = {};
  for (const r of regionDefs) {
    const existing = await prisma.region.findFirst({ where: { name: r.name } });
    if (existing) {
      regions[r.name] = existing;
    } else {
      regions[r.name] = await prisma.region.create({ data: r });
    }
  }
  console.log(`✅ ${Object.keys(regions).length} regions seeded.`);

  // ── Branches ───────────────────────────────────────────────────
  const branchDefs = [
    // Central India
    {
      name: "Bhopal Main Branch",
      regionKey: "Central India Region",
      address: "12, New Market, Bhopal, MP 462001",
      pincode: 462001,
      phone: "07552555100",
      email: "bhopal.main@finance.com",
    },
    {
      name: "Indore Branch",
      regionKey: "Central India Region",
      address: "34, MG Road, Indore, MP 452001",
      pincode: 452001,
      phone: "07312555200",
      email: "indore@finance.com",
    },
    {
      name: "Jabalpur Branch",
      regionKey: "Central India Region",
      address: "7, Russell Chowk, Jabalpur, MP 482001",
      pincode: 482001,
      phone: "07612555300",
      email: "jabalpur@finance.com",
    },
    // West India
    {
      name: "Mumbai Main Branch",
      regionKey: "West India Region",
      address: "101, Nariman Point, Mumbai, MH 400021",
      pincode: 400021,
      phone: "02222555400",
      email: "mumbai.main@finance.com",
    },
    {
      name: "Pune Branch",
      regionKey: "West India Region",
      address: "56, FC Road, Pune, MH 411004",
      pincode: 411004,
      phone: "02022555500",
      email: "pune@finance.com",
    },
    // Gujarat
    {
      name: "Ahmedabad Branch",
      regionKey: "Gujarat Region",
      address: "22, CG Road, Ahmedabad, GJ 380006",
      pincode: 380006,
      phone: "07922555600",
      email: "ahmedabad@finance.com",
    },
    {
      name: "Surat Branch",
      regionKey: "Gujarat Region",
      address: "8, Ring Road, Surat, GJ 395002",
      pincode: 395002,
      phone: "02612555700",
      email: "surat@finance.com",
    },
    // North India
    {
      name: "Jaipur Branch",
      regionKey: "North India Region",
      address: "14, MI Road, Jaipur, RJ 302001",
      pincode: 302001,
      phone: "01412555800",
      email: "jaipur@finance.com",
    },
    // UP & East
    {
      name: "Lucknow Branch",
      regionKey: "UP & East Region",
      address: "88, Hazratganj, Lucknow, UP 226001",
      pincode: 226001,
      phone: "05222555900",
      email: "lucknow@finance.com",
    },
    {
      name: "Kanpur Branch",
      regionKey: "UP & East Region",
      address: "45, The Mall, Kanpur, UP 208001",
      pincode: 208001,
      phone: "05122556000",
      email: "kanpur@finance.com",
    },
    // South India
    {
      name: "Chennai Branch",
      regionKey: "South India Region",
      address: "3, Anna Salai, Chennai, TN 600002",
      pincode: 600002,
      phone: "04422556100",
      email: "chennai@finance.com",
    },
    // Karnataka
    {
      name: "Bengaluru Branch",
      regionKey: "Karnataka Region",
      address: "1, MG Road, Bengaluru, KA 560001",
      pincode: 560001,
      phone: "08022556200",
      email: "bengaluru@finance.com",
    },
  ];

  const branches = {};
  for (const b of branchDefs) {
    const regionId = regions[b.regionKey].id;
    const existing = await prisma.branch.findFirst({ where: { name: b.name, regionId } });
    if (existing) {
      branches[b.name] = existing;
    } else {
      branches[b.name] = await prisma.branch.create({
        data: {
          name:     b.name,
          regionId,
          address:  b.address,
          pincode:  b.pincode,
          phone:    b.phone,
          email:    b.email,
        },
      });
    }
  }
  console.log(`✅ ${Object.keys(branches).length} branches seeded.`);

  // ── Showrooms ──────────────────────────────────────────────────
  const showroomDefs = [
    { name: "Bhopal Auto Hub",       branchKey: "Bhopal Main Branch",   address: "13, New Market, Bhopal" },
    { name: "Indore Wheels Center",  branchKey: "Indore Branch",         address: "35, MG Road, Indore" },
    { name: "Mumbai Motors",         branchKey: "Mumbai Main Branch",    address: "102, Nariman Point, Mumbai" },
    { name: "Pune Vehicle Point",    branchKey: "Pune Branch",           address: "57, FC Road, Pune" },
    { name: "Ahmedabad Auto Zone",   branchKey: "Ahmedabad Branch",      address: "23, CG Road, Ahmedabad" },
    { name: "Surat Motor World",     branchKey: "Surat Branch",          address: "9, Ring Road, Surat" },
    { name: "Jaipur Auto Plaza",     branchKey: "Jaipur Branch",         address: "15, MI Road, Jaipur" },
    { name: "Lucknow Drive Inn",     branchKey: "Lucknow Branch",        address: "89, Hazratganj, Lucknow" },
    { name: "Chennai Cars & Bikes",  branchKey: "Chennai Branch",        address: "4, Anna Salai, Chennai" },
    { name: "Bengaluru Moto Hub",    branchKey: "Bengaluru Branch",      address: "2, MG Road, Bengaluru" },
  ];

  let showroomCount = 0;
  for (const s of showroomDefs) {
    const branchId = branches[s.branchKey].id;
    const existing = await prisma.showroom.findFirst({ where: { name: s.name, branchId } });
    if (!existing) {
      await prisma.showroom.create({ data: { name: s.name, branchId, address: s.address } });
      showroomCount++;
    }
  }
  console.log(`✅ ${showroomCount} showrooms seeded (skipped existing).`);

  console.log("\n📋 Regions seeded:");
  Object.keys(regions).forEach((r) => console.log(`   • ${r}`));
  console.log("\n🏢 Branches seeded:");
  Object.keys(branches).forEach((b) => console.log(`   • ${b}`));
}

main()
  .catch((e) => { console.error("❌ Failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
