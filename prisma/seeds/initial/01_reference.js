// Seeds mandatory reference/lookup data: genders, address categories, relation types, states, cities, photo ID types, and the default admin account.
// Safe to re-run (upsert only). Run on every fresh client install.

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  // ── Admin ──────────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || "admin@finance.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@1234";
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: { name: "Super Admin", email: adminEmail, password: hashedPassword },
  });
  console.log(`✅ Admin seeded: ${adminEmail} / ${adminPassword}`);

  // ── Genders ───────────────────────────────────────────────
  await Promise.all([
    { name: "Female", value: "01" },
    { name: "Male",   value: "02" },
    { name: "Other",  value: "03" },
  ].map((g) => prisma.gender.upsert({ where: { name: g.name }, update: { value: g.value }, create: g })));
  console.log("✅ Genders seeded.");

  // ── Address Categories ─────────────────────────────────────
  await Promise.all([
    { name: "Permanent", value: "01" },
    { name: "Official",  value: "02" },
  ].map((c) => prisma.addressCategory.upsert({ where: { name: c.name }, update: { value: c.value }, create: c })));
  console.log("✅ Address categories seeded.");

  // ── Relation Types ─────────────────────────────────────────
  await Promise.all([
    { name: "Father",   value: "01" },
    { name: "Mother",   value: "02" },
    { name: "Husband",  value: "03" },
    { name: "Wife",     value: "04" },
    { name: "Guardian", value: "05" },
    { name: "Brother",  value: "06" },
    { name: "Sister",   value: "07" },
    { name: "Uncle",    value: "08" },
    { name: "Aunt",     value: "09" },
    { name: "Other",    value: "99" },
  ].map((r) => prisma.relationType.upsert({ where: { name: r.name }, update: { value: r.value }, create: r })));
  console.log("✅ Relation types seeded.");

  // ── States ─────────────────────────────────────────────────
  const states = [
    { name: "JAMMU AND KASHMIR",       stateCode: "01" },
    { name: "HIMACHAL PRADESH",        stateCode: "02" },
    { name: "PUNJAB",                  stateCode: "03" },
    { name: "CHANDIGARH",              stateCode: "04" },
    { name: "UTTARAKHAND",             stateCode: "05" },
    { name: "HARYANA",                 stateCode: "06" },
    { name: "DELHI",                   stateCode: "07" },
    { name: "RAJASTHAN",               stateCode: "08" },
    { name: "UTTAR PRADESH",           stateCode: "09" },
    { name: "BIHAR",                   stateCode: "10" },
    { name: "SIKKIM",                  stateCode: "11" },
    { name: "ARUNACHAL PRADESH",       stateCode: "12" },
    { name: "NAGALAND",                stateCode: "13" },
    { name: "MANIPUR",                 stateCode: "14" },
    { name: "MIZORAM",                 stateCode: "15" },
    { name: "TRIPURA",                 stateCode: "16" },
    { name: "MEGHALAYA",               stateCode: "17" },
    { name: "ASSAM",                   stateCode: "18" },
    { name: "WEST BENGAL",             stateCode: "19" },
    { name: "JHARKHAND",               stateCode: "20" },
    { name: "ORISSA",                  stateCode: "21" },
    { name: "CHHATTISGARH",            stateCode: "22" },
    { name: "MADHYA PRADESH",          stateCode: "23" },
    { name: "GUJARAT",                 stateCode: "24" },
    { name: "DAMAN AND DIU",           stateCode: "25" },
    { name: "DADAR AND NAGAR HAVELI",  stateCode: "26" },
    { name: "MAHARASTRA",              stateCode: "27" },
    { name: "KARNATAKA",               stateCode: "29" },
    { name: "GOA",                     stateCode: "30" },
    { name: "LAKSHADWEEP",             stateCode: "31" },
    { name: "KERALA",                  stateCode: "32" },
    { name: "TAMIL NADU",              stateCode: "33" },
    { name: "PUDUCHERRY",              stateCode: "34" },
    { name: "ANDAMAN AND NICOBAR",     stateCode: "35" },
    { name: "TELANGANA",               stateCode: "36" },
    { name: "ANDHRA PRADESH",          stateCode: "37" },
    { name: "OTHER TERRITORY",         stateCode: "97" },
    { name: "OTHER COUNTRY",           stateCode: "96" },
  ];
  await Promise.all(
    states.map((s) => prisma.state.upsert({ where: { name: s.name }, update: { stateCode: s.stateCode }, create: s }))
  );
  console.log("✅ States seeded.");

  // ── Cities (key cities per state — full set via seedCities.js) ─
  const allStates = await prisma.state.findMany({ select: { id: true, stateCode: true } });
  const stateById = {};
  allStates.forEach((s) => { stateById[s.stateCode] = s.id; });

  const citiesByStateCode = {
    "01": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Sopore", "Kathua", "Udhampur", "Rajouri", "Punch", "Leh"],
    "02": ["Shimla", "Dharamshala", "Solan", "Mandi", "Kullu", "Baddi", "Nahan", "Palampur", "Bilaspur", "Chamba"],
    "03": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Firozpur", "Hoshiarpur", "Gurdaspur", "Sangrur"],
    "04": ["Chandigarh"],
    "05": ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rishikesh", "Nainital", "Mussoorie", "Kotdwara", "Rudrapur", "Kashipur"],
    "06": ["Faridabad", "Gurgaon", "Panipat", "Ambala", "Yamunanagar", "Rohtak", "Hisar", "Karnal", "Sonipat", "Panchkula"],
    "07": ["New Delhi", "Dwarka", "Rohini", "Janakpuri", "Laxmi Nagar", "Saket", "Pitampura", "Nehru Place", "Karol Bagh", "Connaught Place"],
    "08": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Alwar", "Bharatpur", "Sikar", "Pali"],
    "09": ["Lucknow", "Kanpur", "Agra", "Varanasi", "Allahabad", "Meerut", "Ghaziabad", "Noida", "Bareilly", "Aligarh", "Moradabad", "Saharanpur", "Gorakhpur", "Firozabad", "Jhansi", "Muzaffarnagar", "Mathura", "Rampur", "Shahjahanpur", "Farrukhabad"],
    "10": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Arrah", "Bihar Sharif", "Begusarai", "Katihar"],
    "11": ["Gangtok", "Namchi", "Mangan", "Gyalshing"],
    "12": ["Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro", "Bomdila"],
    "13": ["Kohima", "Dimapur", "Mokokchung", "Tuensang", "Wokha"],
    "14": ["Imphal", "Thoubal", "Bishnupur", "Churachandpur", "Senapati"],
    "15": ["Aizawl", "Lunglei", "Champhai", "Serchhip", "Kolasib"],
    "16": ["Agartala", "Udaipur", "Dharmanagar", "Kailashahar", "Ambassa"],
    "17": ["Shillong", "Tura", "Jowai", "Nongstoin", "Baghmara"],
    "18": ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", "Tezpur", "Bongaigaon", "Dhubri", "Sivasagar"],
    "19": ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Bardhaman", "Malda", "Baharampur", "Habra", "Kharagpur", "Haldia", "Raiganj", "Bankura", "Purulia", "Cooch Behar"],
    "20": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar", "Phusro", "Hazaribagh", "Giridih", "Ramgarh", "Medininagar"],
    "21": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri", "Balasore", "Baripada", "Bhadrak", "Jeypore"],
    "22": ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon", "Jagdalpur", "Ambikapur", "Raigarh", "Dhamtari"],
    "23": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna", "Ratlam", "Rewa", "Murwara", "Singrauli", "Burhanpur", "Khandwa", "Bhind"],
    "24": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar", "Junagadh", "Anand", "Navsari", "Morbi", "Nadiad", "Surendranagar", "Bharuch", "Mehsana"],
    "25": ["Daman", "Diu", "Silvassa (DD)"],
    "26": ["Silvassa (DNH)", "Amli", "Khanvel"],
    "27": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Solapur", "Kolhapur", "Thane", "Navi Mumbai", "Pimpri-Chinchwad", "Amravati", "Nanded", "Sangli", "Malegaon", "Jalgaon", "Akola", "Latur", "Dhule", "Ahmednagar", "Chandrapur", "Parbhani", "Ichalkaranji", "Jalna", "Ambernath", "Bhiwandi"],
    "29": ["Bengaluru", "Mysuru", "Hubballi", "Mangaluru", "Belagavi", "Kalaburagi", "Ballari", "Vijayapura", "Shivamogga", "Tumakuru", "Davanagere", "Bidar", "Udupi", "Hassan", "Dharwad"],
    "30": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Bicholim", "Valpoi"],
    "31": ["Kavaratti", "Agatti", "Amini", "Andrott"],
    "32": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Palakkad", "Alappuzha", "Malappuram", "Kannur", "Kasaragod", "Kottayam", "Idukki", "Pathanamthitta", "Wayanad"],
    "33": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Vellore", "Erode", "Thoothukudi", "Tiruppur", "Dindigul", "Thanjavur", "Ranipet", "Sivakasi", "Karur"],
    "34": ["Puducherry", "Karaikal", "Mahe", "Yanam"],
    "35": ["Port Blair", "Diglipur", "Rangat", "Car Nicobar"],
    "36": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Ramagundam", "Mahbubnagar", "Nalgonda", "Adilabad", "Suryapet"],
    "37": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Kakinada", "Tirupati", "Rajahmundry", "Kadapa", "Anantapur", "Eluru", "Ongole", "Vizianagaram", "Srikakulam", "Chittoor"],
  };

  let cityCount = 0;
  for (const [stateCode, cities] of Object.entries(citiesByStateCode)) {
    const stateId = stateById[stateCode];
    if (!stateId) continue;
    for (const cityName of cities) {
      await prisma.city.upsert({
        where: { name_stateId: { name: cityName, stateId } },
        update: {},
        create: { name: cityName, stateId },
      });
      cityCount++;
    }
  }
  console.log(`✅ ${cityCount} cities seeded (core set). Run seedCities.js for full 3800+ cities.`);

  // ── Photo ID Types ─────────────────────────────────────────
  await Promise.all([
    { name: "AADHAAR",         description: "12-digit unique identity number",                   minLength: 12, maxLength: 12, numberTypeEg: "123412341234",    validation: "^[0-9]{12}$" },
    { name: "PAN",             description: "Permanent Account Number (PAN) card",               minLength: 10, maxLength: 10, numberTypeEg: "ABCDE1234F",       validation: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$" },
    { name: "DRIVING_LICENSE", description: "Driving License number in India",                   minLength: 10, maxLength: 20, numberTypeEg: "MH12 20110001234", validation: "^[A-Z]{2}[0-9]{2}s?[0-9]{11}$" },
    { name: "PASSPORT",        description: "Indian Passport number (1 letter + 7 digits)",     minLength: 8,  maxLength: 8,  numberTypeEg: "Z1234567",         validation: "^[A-Z][0-9]{7}$" },
    { name: "VOTER_ID",        description: "Voter ID / Electoral Photo Identity Card (EPIC)",   minLength: 10, maxLength: 10, numberTypeEg: "ABC1234567",        validation: "^[A-Z]{3}[0-9]{7}$" },
  ].map((t) =>
    prisma.photoIdType.upsert({
      where: { name: t.name },
      update: { description: t.description, minLength: t.minLength, maxLength: t.maxLength, numberTypeEg: t.numberTypeEg, validation: t.validation },
      create: t,
    })
  ));
  console.log("✅ Photo ID types seeded.");
}

main()
  .catch((e) => { console.error("❌ Failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
