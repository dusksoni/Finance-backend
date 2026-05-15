const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Map from API state name → DB state code
const STATE_MAP = {
  "Andaman and Nicobar Islands": "35",
  "Andhra Pradesh":              "37",
  "Arunachal Pradesh":           "12",
  "Assam":                       "18",
  "Bihar":                       "10",
  "Chandigarh":                  "04",
  "Chhattisgarh":                "22",
  "Dadra and Nagar Haveli":      "26",
  "Daman and Diu":               "25",
  "Delhi":                       "07",
  "Goa":                         "30",
  "Gujarat":                     "24",
  "Haryana":                     "06",
  "Himachal Pradesh":            "02",
  "Jammu and Kashmir":           "01",
  "Jharkhand":                   "20",
  "Karnataka":                   "29",
  "Kerala":                      "32",
  "Lakshadweep":                 "31",
  "Madhya Pradesh":              "23",
  "Maharashtra":                 "27",
  "Manipur":                     "14",
  "Meghalaya":                   "17",
  "Mizoram":                     "15",
  "Nagaland":                    "13",
  "Odisha":                      "21",
  "Puducherry":                  "34",
  "Punjab":                      "03",
  "Rajasthan":                   "08",
  "Sikkim":                      "11",
  "Tamil Nadu":                  "33",
  "Telangana":                   "36",
  "Tripura":                     "16",
  "Uttar Pradesh":               "09",
  "Uttarakhand":                 "05",
  "West Bengal":                 "19",
  // Ladakh is not in DB as a separate state, skip it
};

async function fetchCities(stateName) {
  const url = `https://countriesnow.space/api/v0.1/countries/state/cities/q?country=India&state=${encodeURIComponent(stateName)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`API error for ${stateName}: ${json.msg}`);
  return json.data || [];
}

async function main() {
  // Load all DB states
  const dbStates = await prisma.state.findMany({ select: { id: true, stateCode: true } });
  const stateIdByCode = {};
  dbStates.forEach((s) => { stateIdByCode[s.stateCode] = s.id; });

  // Snapshot region→city/state mappings before wiping
  const regionSnapshots = await prisma.region.findMany({ select: { id: true, stateId: true } });

  // Use TRUNCATE CASCADE to remove cities and automatically clear all FK references
  await prisma.$executeRawUnsafe(`TRUNCATE "City" RESTART IDENTITY CASCADE`);
  console.log("🧹 Cleared existing cities (cascade wiped all references).");

  let total = 0;

  for (const [apiStateName, stateCode] of Object.entries(STATE_MAP)) {
    const stateId = stateIdByCode[stateCode];
    if (!stateId) {
      console.warn(`⚠️  No DB state found for code ${stateCode} (${apiStateName}), skipping.`);
      continue;
    }

    let cities;
    try {
      cities = await fetchCities(apiStateName);
    } catch (err) {
      console.error(`❌ Failed to fetch cities for ${apiStateName}:`, err.message);
      continue;
    }

    if (!cities.length) {
      console.warn(`⚠️  No cities returned for ${apiStateName}`);
      continue;
    }

    // Deduplicate within this state's city list before inserting
    const seen = new Set();
    const uniqueCities = cities.filter((c) => {
      if (seen.has(c)) return false;
      seen.add(c);
      return true;
    });

    await prisma.city.createMany({
      data: uniqueCities.map((name) => ({ name, stateId })),
      skipDuplicates: true,
    });
    const inserted = uniqueCities.length;

    console.log(`✅ ${apiStateName}: ${inserted} cities`);
    total += inserted;

    // Small delay to avoid rate limiting (400 req limit)
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n🎉 Done! Total cities inserted: ${total}`);

  // Regions were cascade-deleted with cities — nothing to re-link
  console.log(`ℹ️  Regions were cleared by cascade (they referenced old cities). Please re-create regions via the admin UI.`);
}

main()
  .catch((e) => { console.error("❌ Failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
