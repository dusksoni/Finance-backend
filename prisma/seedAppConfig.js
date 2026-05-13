// prisma/seedAppConfig.js
// Seeds default NBFC AppConfig values into the database.
// Run with: node prisma/seedAppConfig.js

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const configs = [
  {
    key: "nbfc.penal_interest",
    category: "nbfc",
    label: "Penal Interest",
    description: "Tiered penal interest charged on overdue EMIs based on days past due date.",
    isPublic: false,
    value: {
      enabled: true,
      waivable: true,
      tiers: [
        { fromDay: 0,  toDay: 7,    ratePercent: 0   },
        { fromDay: 7,  toDay: 21,   ratePercent: 2.5 },
        { fromDay: 21, toDay: null, ratePercent: 5   },
      ],
    },
  },
  {
    key: "nbfc.late_fee",
    category: "nbfc",
    label: "Late Fee & Bounce Charges",
    description: "Flat fees charged on missed EMI or NACH/ECS bounce events.",
    isPublic: false,
    value: {
      enabled: true,
      flatAmountPerBounce: 0,
      nachBounceCharge: 500,
      maxLateFeeCap: 0,
      waivable: true,
    },
  },
  {
    key: "nbfc.processing_fee_gst",
    category: "nbfc",
    label: "GST on Processing Fee",
    description: "GST applied on loan processing fee at disbursement.",
    isPublic: false,
    value: {
      enabled: true,
      cgstPercent: 9,
      sgstPercent: 9,
      igstPercent: 18,
      applyIgstForInterState: false,
      gstRegistrationNumber: "",
    },
  },
  {
    key: "nbfc.tds",
    category: "nbfc",
    label: "TDS on Interest (Section 194A)",
    description: "TDS deduction on interest. Enable only if NBFC accepts deposits.",
    isPublic: false,
    value: {
      enabled: false,
      thresholdAmountINR: 40000,
      tdsRatePercent: 10,
      tdsRateNoPanPercent: 20,
      tanNumber: "",
    },
  },
  {
    key: "nbfc.foreclosure",
    category: "nbfc",
    label: "Pre-closure / Foreclosure Charges",
    description: "Charges when a borrower closes the loan before tenure ends.",
    isPublic: false,
    value: {
      enabled: true,
      chargePercent: 2,
      minLockInMonths: 3,
      noChargeAfterMonths: 0,
      waivable: true,
    },
  },
  {
    key: "nbfc.part_payment",
    category: "nbfc",
    label: "Part Payment (Prepayment)",
    description: "Rules for partial prepayment of outstanding loan principal.",
    isPublic: false,
    value: {
      enabled: true,
      chargePercent: 0,
      minPartPaymentAmount: 1000,
      allowedFrequency: "ANYTIME",
      reduceTenure: true,
    },
  },
  {
    key: "nbfc.foir_limits",
    category: "nbfc",
    label: "FOIR Eligibility Thresholds",
    description: "Fixed Obligation to Income Ratio limits used during credit appraisal.",
    isPublic: false,
    value: {
      eligibleMaxPercent: 50,
      marginalMaxPercent: 65,
      allowManualOverrideForMarginal: true,
    },
  },
  {
    key: "nbfc.cibil",
    category: "nbfc",
    label: "CIBIL / Credit Bureau Integration",
    description: "TransUnion CIBIL API credentials and score thresholds.",
    isPublic: false,
    value: {
      enabled: false,
      provider: "TRANSUNION_CIBIL",
      apiUrl: "",
      memberId: "",
      password: "",
      minAcceptableScore: 650,
      marginalScore: 700,
      pullOnLoanApplication: false,
      pullOnDisbursement: false,
    },
  },
  {
    key: "nbfc.kfs",
    category: "nbfc",
    label: "Key Fact Statement (KFS)",
    description: "RBI-mandated KFS settings.",
    isPublic: false,
    value: {
      enabled: true,
      requireAcknowledgmentBeforeDisbursement: false,
      validityDays: 3,
      footerDisclaimer: "This Key Fact Statement is issued as per RBI guidelines. Please read carefully before signing the loan agreement.",
    },
  },
  {
    key: "nbfc.loan_documents",
    category: "nbfc",
    label: "Loan Document Settings",
    description: "Prefixes and signatory details for loan documents.",
    isPublic: false,
    value: {
      sanctionLetterPrefix: "SL",
      agreementPrefix: "LA",
      noDuesPrefix: "NDC",
      authorizedSignatoryName: "",
      authorizedSignatoryDesignation: "Authorized Signatory",
      stampDutyDisclaimer: "",
    },
  },
];

async function main() {
  console.log("Seeding NBFC AppConfig...");
  for (const config of configs) {
    await prisma.appConfig.upsert({
      where: { key: config.key },
      update: {}, // don't overwrite if already customised
      create: {
        key: config.key,
        category: config.category,
        label: config.label,
        description: config.description,
        isPublic: config.isPublic,
        value: config.value,
      },
    });
    console.log(`  ✓ ${config.key}`);
  }
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
