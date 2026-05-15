const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {

  // ============================================================
  // 🚗 VEHICLE BRANDS, MODELS, VARIANTS
  // ============================================================
  const vehicles = [
    {
      brand: "Hero MotoCorp",
      models: [
        { name: "Splendor Plus",   variants: ["Standard", "i3S", "Kick Start", "Self Start"] },
        { name: "HF Deluxe",       variants: ["Standard", "i3S"] },
        { name: "Passion Pro",     variants: ["Standard", "TR"] },
        { name: "Glamour",         variants: ["Standard", "BS6"] },
        { name: "Super Splendor",  variants: ["Standard"] },
        { name: "Xtreme 160R",     variants: ["Standard", "S"] },
        { name: "Destini 125",     variants: ["Standard", "Platinum"] },
        { name: "Maestro Edge 125",variants: ["Standard", "FI"] },
      ],
    },
    {
      brand: "Honda",
      models: [
        { name: "Activa 6G",       variants: ["Standard", "DLX", "Premium"] },
        { name: "Shine",           variants: ["Standard", "SP"] },
        { name: "SP 125",          variants: ["Standard", "SP"] },
        { name: "Unicorn",         variants: ["Standard"] },
        { name: "CB Hornet 160R",  variants: ["Standard", "ABS"] },
        { name: "Dio",             variants: ["Standard", "DLX"] },
        { name: "Grazia 125",      variants: ["Standard", "Sports"] },
        { name: "CD 110 Dream",    variants: ["Standard", "DX"] },
      ],
    },
    {
      brand: "Bajaj",
      models: [
        { name: "Pulsar 150",      variants: ["Standard", "Neon", "Twin Disc"] },
        { name: "Pulsar 125",      variants: ["Standard", "Neon"] },
        { name: "Pulsar NS160",    variants: ["Standard", "ABS"] },
        { name: "Pulsar NS200",    variants: ["Standard", "ABS"] },
        { name: "CT 100",          variants: ["Standard", "ES"] },
        { name: "Platina 100",     variants: ["Standard", "ES", "H-Gear"] },
        { name: "Avenger Street 160", variants: ["Standard"] },
        { name: "Dominar 400",     variants: ["Standard"] },
      ],
    },
    {
      brand: "TVS",
      models: [
        { name: "Jupiter",         variants: ["Standard", "Classic", "ZX", "Grande"] },
        { name: "Apache RTR 160",  variants: ["Standard", "4V", "4V Race Edition"] },
        { name: "Apache RTR 200",  variants: ["Standard", "4V"] },
        { name: "XL100",           variants: ["Standard", "Comfort", "Heavy Duty"] },
        { name: "Sport",           variants: ["Standard"] },
        { name: "Ntorq 125",       variants: ["Standard", "Race Edition", "Super Squad"] },
        { name: "Raider 125",      variants: ["Standard", "Drum", "Disc"] },
        { name: "Star City Plus",  variants: ["Standard"] },
      ],
    },
    {
      brand: "Yamaha",
      models: [
        { name: "FZ-S V3",         variants: ["Standard", "Darknight"] },
        { name: "FZS FI",          variants: ["Standard"] },
        { name: "R15 V4",          variants: ["Standard", "M"] },
        { name: "MT-15 V2",        variants: ["Standard"] },
        { name: "Fascino 125",     variants: ["Standard", "Fi Hybrid"] },
        { name: "Ray ZR 125",      variants: ["Standard", "Fi Hybrid", "Street Rally"] },
        { name: "Saluto 125",      variants: ["Standard", "RX"] },
      ],
    },
    {
      brand: "Suzuki",
      models: [
        { name: "Access 125",      variants: ["Standard", "SE", "CBS", "CBS Fe"] },
        { name: "Burgman Street",  variants: ["Standard", "EX"] },
        { name: "Gixxer 150",      variants: ["Standard", "SF"] },
        { name: "Gixxer SF 250",   variants: ["Standard", "MotoGP"] },
        { name: "Avenis 125",      variants: ["Standard"] },
      ],
    },
    {
      brand: "Royal Enfield",
      models: [
        { name: "Classic 350",     variants: ["Standard", "Dark", "Chrome", "Signals"] },
        { name: "Bullet 350",      variants: ["Standard", "ES"] },
        { name: "Meteor 350",      variants: ["Fireball", "Stellar", "Supernova"] },
        { name: "Hunter 350",      variants: ["Dapper", "Rebel", "Metro"] },
        { name: "Thunderbird 350X",variants: ["Standard"] },
      ],
    },
    {
      brand: "KTM",
      models: [
        { name: "Duke 125",        variants: ["Standard"] },
        { name: "Duke 200",        variants: ["Standard"] },
        { name: "Duke 390",        variants: ["Standard"] },
        { name: "RC 200",          variants: ["Standard"] },
        { name: "RC 390",          variants: ["Standard"] },
      ],
    },
  ];

  console.log("🚗 Seeding vehicle brands, models, variants...");
  for (const { brand, models } of vehicles) {
    const b = await prisma.vehicleBrand.upsert({
      where: { name: brand },
      update: {},
      create: { name: brand },
    });
    for (const { name: modelName, variants } of models) {
      const existing = await prisma.vehicleModel.findFirst({ where: { name: modelName, brandId: b.id } });
      const m = existing || await prisma.vehicleModel.create({ data: { name: modelName, brandId: b.id } });
      for (const variantName of variants) {
        const ev = await prisma.vehicleVariant.findFirst({ where: { name: variantName, modelId: m.id } });
        if (!ev) await prisma.vehicleVariant.create({ data: { name: variantName, modelId: m.id } });
      }
    }
  }
  console.log("✅ Vehicles seeded.");

  // ============================================================
  // 🌾 AGRICULTURE EQUIPMENT
  // ============================================================
  const equipmentList = [
    "Tractor", "Power Tiller", "Harvester", "Combine Harvester",
    "Rotavator", "Seed Drill", "Sprayer", "Water Pump",
    "Thresher", "Plough", "Cultivator", "Rice Transplanter",
    "Reaper", "Fodder Cutter", "Chaff Cutter",
  ];
  console.log("🌾 Seeding agriculture equipment...");
  for (const name of equipmentList) {
    await prisma.equipment.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log("✅ Equipment seeded.");

  // ============================================================
  // 🔢 NUMBERING FORMATS
  // ============================================================
  console.log("🔢 Seeding numbering formats...");
  const numberingFormats = [
    { entityType: "FILE_NO",      prefix: "KF",   separator: "-", padLength: 6, resetMonthly: false, example: "KF-000001" },
    { entityType: "RECEIPT_NO",   prefix: "RCP",  separator: "-", padLength: 6, resetMonthly: true,  example: "RCP-000001" },
    { entityType: "CUSTOMER_ID",  prefix: "CUS",  separator: "-", padLength: 6, resetMonthly: false, example: "CUS-000001" },
    { entityType: "EMPLOYEE_ID",  prefix: "EMP",  separator: "-", padLength: 4, resetMonthly: false, example: "EMP-0001" },
  ];
  for (const fmt of numberingFormats) {
    await prisma.numberingFormat.upsert({
      where: { entityType: fmt.entityType },
      update: {},
      create: fmt,
    });
  }
  console.log("✅ Numbering formats seeded.");

  // ============================================================
  // ⚙️ APP CONFIG (NBFC Settings)
  // ============================================================
  console.log("⚙️  Seeding app config...");
  const configs = [
    {
      key: "nbfc.penal_interest", category: "nbfc", label: "Penal Interest",
      description: "Tiered penal interest charged on overdue EMIs based on days past due date.",
      isPublic: false,
      value: {
        enabled: true, waivable: true,
        tiers: [
          { fromDay: 0,  toDay: 7,    ratePercent: 0   },
          { fromDay: 7,  toDay: 21,   ratePercent: 2.5 },
          { fromDay: 21, toDay: null, ratePercent: 5   },
        ],
      },
    },
    {
      key: "nbfc.late_fee", category: "nbfc", label: "Late Fee & Bounce Charges",
      description: "Flat fees charged on missed EMI or NACH/ECS bounce events.",
      isPublic: false,
      value: { enabled: true, flatAmountPerBounce: 0, nachBounceCharge: 500, maxLateFeeCap: 0, waivable: true },
    },
    {
      key: "nbfc.processing_fee_gst", category: "nbfc", label: "GST on Processing Fee",
      description: "GST applied on loan processing fee at disbursement.",
      isPublic: false,
      value: { enabled: true, cgstPercent: 9, sgstPercent: 9, igstPercent: 18, applyIgstForInterState: false, gstRegistrationNumber: "" },
    },
    {
      key: "nbfc.tds", category: "nbfc", label: "TDS on Interest (Section 194A)",
      description: "TDS deduction on interest. Enable only if NBFC accepts deposits.",
      isPublic: false,
      value: { enabled: false, thresholdAmountINR: 40000, tdsRatePercent: 10, tdsRateNoPanPercent: 20, tanNumber: "" },
    },
    {
      key: "nbfc.foreclosure", category: "nbfc", label: "Pre-closure / Foreclosure Charges",
      description: "Charges when a borrower closes the loan before tenure ends.",
      isPublic: false,
      value: { enabled: true, chargePercent: 2, minLockInMonths: 3, noChargeAfterMonths: 0, waivable: true },
    },
    {
      key: "nbfc.part_payment", category: "nbfc", label: "Part Payment (Prepayment)",
      description: "Rules for partial prepayment of outstanding loan principal.",
      isPublic: false,
      value: { enabled: true, chargePercent: 0, minPartPaymentAmount: 1000, allowedFrequency: "ANYTIME", reduceTenure: true },
    },
    {
      key: "nbfc.foir_limits", category: "nbfc", label: "FOIR Eligibility Thresholds",
      description: "Fixed Obligation to Income Ratio limits used during credit appraisal.",
      isPublic: false,
      value: { eligibleMaxPercent: 50, marginalMaxPercent: 65, allowManualOverrideForMarginal: true },
    },
    {
      key: "nbfc.cibil", category: "nbfc", label: "CIBIL / Credit Bureau Integration",
      description: "Credit bureau provider and score thresholds. Providers: surepass (sandbox-ready), transunion (requires NBFC membership), mock (dev only).",
      isPublic: false,
      value: {
        enabled: false,
        provider: "surepass",
        minAcceptableScore: 650,
        marginalScore: 700,
        pullOnLoanApplication: false,
        pullOnDisbursement: false,
        surepassToken: "",
        surepassApiUrl: "https://kyc-api.surepass.io/api/v1/credit-report/cibil",
        apiUrl: "",
        memberId: "",
        password: "",
      },
    },
    {
      key: "nbfc.kfs", category: "nbfc", label: "Key Fact Statement (KFS)",
      description: "RBI-mandated KFS settings.",
      isPublic: false,
      value: { enabled: true, requireAcknowledgmentBeforeDisbursement: false, validityDays: 3, footerDisclaimer: "This Key Fact Statement is issued as per RBI guidelines. Please read carefully before signing the loan agreement." },
    },
    {
      key: "nbfc.loan_documents", category: "nbfc", label: "Loan Document Settings",
      description: "Prefixes and signatory details for loan documents.",
      isPublic: false,
      value: { sanctionLetterPrefix: "SL", agreementPrefix: "LA", noDuesPrefix: "NDC", authorizedSignatoryName: "", authorizedSignatoryDesignation: "Authorized Signatory", stampDutyDisclaimer: "" },
    },
    // ── Payment Gateways ──
    {
      key: "payment.orange", category: "payment", label: "Orange PG (UPI/QR)",
      description: "PhiCommerce Orange PG — UPI QR code payments. Already integrated.",
      isPublic: false,
      value: { enabled: false, merchantId: "", aggregatorId: "", secretKey: "", currencyCode: "356", apiUrl: "https://qa.phicommerce.com/pg/api/v2", returnUrl: "" },
    },
    {
      key: "payment.icici", category: "payment", label: "ICICI EazyPay",
      description: "ICICI Bank EazyPay QR & payment gateway credentials and settings.",
      isPublic: false,
      value: { enabled: false, mode: "sandbox", merchantId: "", subMerchantId: "", terminalId: "5411", apiKey: "", merchantVPA: "", merchantName: "", gatewayUrl: "https://apibankingonesandbox.icicibank.com", callbackUrl: "" },
    },
    {
      key: "payment.settings", category: "payment", label: "Payment Settings",
      description: "Global payment collection settings across all gateways.",
      isPublic: false,
      value: { activeGateway: "none", allowPartialPayment: false, allowOverpayment: false, minPayableAmount: 1, receiptAutoGenerate: true, notifyBorrowerOnSuccess: true, notifyAdminOnSuccess: false },
    },
    {
      key: "payment.razorpay", category: "payment", label: "Razorpay",
      description: "Razorpay payment gateway credentials and settings.",
      isPublic: false,
      value: { enabled: false, mode: "test", keyId: "", keySecret: "", webhookSecret: "", currency: "INR", captureAutomatically: true, description: "Loan EMI Payment", logo: "", brandColor: "#11a75c" },
    },
    {
      key: "payment.cashfree", category: "payment", label: "Cashfree",
      description: "Cashfree payment gateway credentials and settings.",
      isPublic: false,
      value: { enabled: false, mode: "sandbox", appId: "", secretKey: "", webhookSecret: "", currency: "INR", captureAutomatically: true },
    },
    {
      key: "payment.payu", category: "payment", label: "PayU",
      description: "PayU payment gateway credentials and settings.",
      isPublic: false,
      value: { enabled: false, mode: "test", merchantKey: "", merchantSalt: "", webhookSecret: "", currency: "INR" },
    },
  ];
  for (const config of configs) {
    await prisma.appConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }

  // ── Additional AppConfig keys ──────────────────────────────────────────────
  console.log("⚙️  Seeding additional app config keys...");
  const additionalConfigs = [
    {
      key: "branding.company_profile",
      category: "branding",
      label: "Company Profile",
      description: "Core company identity used across admin, public flows, and generated documents.",
      isPublic: true,
      value: {
        companyName: process.env.COMPANY_NAME || "Finance Company",
        legalName: process.env.COMPANY_NAME || "Finance Company",
        supportEmail: "",
        supportPhone: "",
        websiteUrl: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        pincode: "",
      },
    },
    {
      key: "branding.receipt_preferences",
      category: "branding",
      label: "Receipt Preferences",
      description: "Receipt footer and display preferences for generated receipts and exports.",
      isPublic: true,
      value: {
        receiptTitle: "Loan Payment Receipt",
        footerText: "",
        showBranchAddress: true,
        showSupportContact: true,
      },
    },
    {
      key: "public_portal.payment",
      category: "public_portal",
      label: "Public Payment Portal",
      description: "Controls borrower self-service payment access and public portal behavior.",
      isPublic: true,
      value: {
        enabled: true,
        allowManualPaymentRequest: true,
        allowReceiptDownload: true,
        allowPaymentHistory: true,
        allowLoanSummary: true,
        allowStatementDownload: true,
        allowDueCalendar: true,
        allowPublicGrievance: true,
        allowPublicGrievanceComments: true,
        requirePhoneVerification: true,
        sessionTtlMinutes: 30,
      },
    },
    {
      key: "security.public_access",
      category: "security",
      label: "Public Access Security",
      description: "Security controls for borrower-facing payment and loan lookup access.",
      isPublic: false,
      value: {
        requireAccessToken: false,
        maxConcurrentSessionsPerLoan: 3,
        verificationMethods: ["PHONE", "DOB"],
        tokenTtlMinutes: 30,
      },
    },
    {
      key: "grievance.management",
      category: "grievance",
      label: "Grievance Management",
      description: "Ticket categories and service-level expectations for complaint handling.",
      isPublic: false,
      value: {
        categories: ["SERVICE", "PAYMENT", "STAFF_BEHAVIOUR", "LOAN_PROCESSING", "DOCUMENTS", "OTHER"],
        publicCategories: ["SERVICE", "PAYMENT", "DOCUMENTS", "OTHER"],
        defaultPriority: "MEDIUM",
        publicDefaultPriority: "MEDIUM",
        ticketPrefix: "GRV",
        publicCommentEnabled: true,
        autoAssignToBranchEmployee: false,
        slaHours: { LOW: 72, MEDIUM: 48, HIGH: 24, URGENT: 8 },
      },
    },
    {
      key: "numbering.payment_receipt",
      category: "numbering",
      label: "Payment Receipt Numbering",
      description: "Prefix and reset behavior for borrower-facing payment references.",
      isPublic: false,
      value: {
        prefix: "RCT",
        includeDate: true,
        resetPeriod: "DAILY",
      },
    },
  ];
  for (const config of additionalConfigs) {
    await prisma.appConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }
  console.log("✅ App config seeded.");

  // ============================================================
  // SUMMARY
  // ============================================================
  const [brands, models, variants, equipment, formats, appConfigs] = await Promise.all([
    prisma.vehicleBrand.count(),
    prisma.vehicleModel.count(),
    prisma.vehicleVariant.count(),
    prisma.equipment.count(),
    prisma.numberingFormat.count(),
    prisma.appConfig.count(),
  ]);

  console.log("\n========================================");
  console.log("🎉 MASTER DATA SEEDING COMPLETE!");
  console.log("========================================");
  console.log(`  Vehicle Brands  : ${brands}`);
  console.log(`  Vehicle Models  : ${models}`);
  console.log(`  Vehicle Variants: ${variants}`);
  console.log(`  Equipment       : ${equipment}`);
  console.log(`  Numbering Fmts  : ${formats}`);
  console.log(`  App Config Keys : ${appConfigs} (incl. payment gateways)`);
  console.log("========================================\n");
}

main()
  .catch((e) => { console.error("❌ Failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
