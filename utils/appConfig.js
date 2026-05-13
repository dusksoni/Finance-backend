const APP_CONFIG_DEFINITIONS = {
  // ─── NBFC Financial Rules ───────────────────────────────────────────────────
  "nbfc.penal_interest": {
    category: "nbfc",
    label: "Penal Interest",
    description: "Penal/default interest charged on overdue EMIs after grace period.",
    isPublic: false,
    value: {
      enabled: true,
      ratePerAnnum: 24,           // % per annum on overdue principal
      gracePeriodDays: 3,         // days after due date before penal kicks in
      compoundingFrequency: "MONTHLY", // DAILY | MONTHLY
      waivable: true,             // whether admin can waive penal interest
    },
  },
  "nbfc.late_fee": {
    category: "nbfc",
    label: "Late Fee (Bounce / EMI Bounce)",
    description: "Flat late fee charged per bounced or missed EMI.",
    isPublic: false,
    value: {
      enabled: true,
      flatAmountPerBounce: 500,   // INR flat fee per bounce event
      nachBounceCharge: 500,      // INR charged on NACH/ECS bounce
      maxLateFeeCap: 5000,        // INR max per EMI (0 = no cap)
      waivable: true,
    },
  },
  "nbfc.processing_fee_gst": {
    category: "nbfc",
    label: "GST on Processing Fee",
    description: "GST rate applied on loan processing fee at the time of disbursement.",
    isPublic: false,
    value: {
      enabled: true,
      gstRatePercent: 18,         // % GST (CGST 9% + SGST 9%)
      cgstPercent: 9,
      sgstPercent: 9,
      igstPercent: 18,            // for inter-state (use either CGST+SGST or IGST)
      applyIgstForInterState: false,
      gstRegistrationNumber: "",  // GSTIN of NBFC
    },
  },
  "nbfc.tds": {
    category: "nbfc",
    label: "TDS on Interest (Section 194A)",
    description: "TDS deduction rules on interest paid/credited (Section 194A IT Act).",
    isPublic: false,
    value: {
      enabled: false,             // enable only if NBFC pays interest (FDs/deposits)
      thresholdAmountINR: 40000,  // TDS triggered if interest > this per FY (₹40k for NBFCs)
      tdsRatePercent: 10,         // 10% if PAN provided, 20% if not
      tdsRateNoPanPercent: 20,
      tanNumber: "",              // TAN of NBFC for TDS filing
    },
  },
  "nbfc.foreclosure": {
    category: "nbfc",
    label: "Pre-closure / Foreclosure Charges",
    description: "Charges levied when a borrower closes the loan before tenure ends.",
    isPublic: false,
    value: {
      enabled: true,
      chargePercent: 2,           // % on outstanding principal
      noChargeAfterMonths: 0,     // 0 = always charge; set e.g. 12 to waive after 1 yr
      minLockInMonths: 0,         // no pre-closure allowed before this many months
      waivable: true,
    },
  },
  "nbfc.part_payment": {
    category: "nbfc",
    label: "Part Payment (Prepayment)",
    description: "Rules for partial prepayment of loan principal.",
    isPublic: false,
    value: {
      enabled: true,
      chargePercent: 0,           // % on part-payment amount (0 = free)
      minPartPaymentAmount: 1000, // minimum INR amount for a part payment
      allowedFrequency: "ANYTIME",// ANYTIME | ONCE_PER_YEAR | QUARTERLY
      reduceTenure: true,         // true = reduce tenure, false = reduce EMI
    },
  },
  "nbfc.foir_limits": {
    category: "nbfc",
    label: "FOIR Eligibility Thresholds",
    description: "Fixed Obligation to Income Ratio limits used during credit appraisal.",
    isPublic: false,
    value: {
      eligibleMaxPercent: 50,     // FOIR <= 50% → ELIGIBLE
      marginalMaxPercent: 65,     // FOIR 50-65% → MARGINAL (needs manual review)
      // FOIR > 65% → INELIGIBLE
      allowManualOverrideForMarginal: true,
    },
  },
  "nbfc.cibil": {
    category: "nbfc",
    label: "CIBIL / Credit Bureau Integration",
    description: "TransUnion CIBIL API credentials and score thresholds.",
    isPublic: false,
    value: {
      enabled: false,
      provider: "TRANSUNION_CIBIL", // TRANSUNION_CIBIL | EXPERIAN | CRIF | EQUIFAX
      apiUrl: "",
      memberId: "",
      password: "",                 // stored encrypted — set via env in production
      minAcceptableScore: 650,      // reject below this
      marginalScore: 700,           // manual review between min and this
      pullOnLoanApplication: true,  // auto-pull when loan application submitted
      pullOnDisbursement: false,
    },
  },
  "nbfc.kfs": {
    category: "nbfc",
    label: "Key Fact Statement (KFS)",
    description: "RBI-mandated Key Fact Statement settings (circular Sept 2023).",
    isPublic: false,
    value: {
      enabled: true,
      requireAcknowledgmentBeforeDisbursement: true,
      validityDays: 3,            // KFS offer valid for this many days
      footerDisclaimer: "This Key Fact Statement is issued as per RBI circular on Interest Rate and other charges on loans dated September 2023.",
    },
  },
  "nbfc.loan_documents": {
    category: "nbfc",
    label: "Loan Document Settings",
    description: "Settings for sanction letter, agreement, and no-dues certificate generation.",
    isPublic: false,
    value: {
      sanctionLetterPrefix: "SL",
      agreementPrefix: "LA",
      noDuesPrefix: "NDC",
      stampDutyDisclaimer: "This agreement is subject to applicable stamp duty.",
      authorizedSignatoryName: "",
      authorizedSignatoryDesignation: "Authorized Signatory",
    },
  },
  // ─── Branding ───────────────────────────────────────────────────────────────
  "branding.company_profile": {
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
  "branding.receipt_preferences": {
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
  "public_portal.payment": {
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
  "security.public_access": {
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
  "grievance.management": {
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
      slaHours: {
        LOW: 72,
        MEDIUM: 48,
        HIGH: 24,
        URGENT: 8,
      },
    },
  },
  "numbering.payment_receipt": {
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
};

const mergeDeep = (base, override) => {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (!base || typeof base !== "object") return override ?? base;

  const result = { ...base };
  const source = override && typeof override === "object" ? override : {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = mergeDeep(base[key], value);
  }
  return result;
};

const validationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const validateShape = (value, template, path) => {
  if (template === null || template === undefined) {
    return value;
  }

  if (Array.isArray(template)) {
    if (!Array.isArray(value)) {
      throw validationError(`Invalid value for ${path}: expected array`);
    }
    if (template.length === 0) return value;

    const sample = template[0];
    value.forEach((item, index) => validateShape(item, sample, `${path}[${index}]`));
    return value;
  }

  if (typeof template === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw validationError(`Invalid value for ${path}: expected object`);
    }

    const normalized = { ...value };
    for (const [key, childTemplate] of Object.entries(template)) {
      if (!(key in normalized)) {
        throw validationError(`Missing required config field ${path}.${key}`);
      }
      validateShape(normalized[key], childTemplate, `${path}.${key}`);
    }
    return normalized;
  }

  if (typeof value !== typeof template) {
    throw validationError(`Invalid value for ${path}: expected ${typeof template}`);
  }

  return value;
};

const prepareConfigValue = ({ key, value, existingValue = undefined }) => {
  const definition = APP_CONFIG_DEFINITIONS[key];
  if (!definition) return value;

  const baseValue =
    existingValue && typeof existingValue === "object" && !Array.isArray(existingValue)
      ? mergeDeep(definition.value, existingValue)
      : definition.value;

  const mergedValue =
    value && typeof value === "object" && !Array.isArray(value)
      ? mergeDeep(baseValue, value)
      : value;

  validateShape(mergedValue, definition.value, key);
  return mergedValue;
};

const buildDefaultConfigRecords = () =>
  Object.entries(APP_CONFIG_DEFINITIONS).map(([key, definition]) => ({
    key,
    category: definition.category,
    label: definition.label,
    description: definition.description,
    isPublic: definition.isPublic,
    value: definition.value,
    source: "default",
  }));

const mergeDefinitionWithStored = (stored) => {
  const definition = APP_CONFIG_DEFINITIONS[stored.key];
  if (!definition) {
    return {
      ...stored,
      source: "database",
    };
  }

  return {
    key: stored.key,
    category: stored.category || definition.category,
    label: stored.label || definition.label,
    description: stored.description ?? definition.description,
    isPublic: typeof stored.isPublic === "boolean" ? stored.isPublic : definition.isPublic,
    value: stored.value ?? definition.value,
    updatedAt: stored.updatedAt,
    createdAt: stored.createdAt,
    source: "database",
  };
};

const buildEffectiveConfigList = (storedRecords = []) => {
  const byKey = new Map(storedRecords.map((record) => [record.key, mergeDefinitionWithStored(record)]));

  for (const defaultRecord of buildDefaultConfigRecords()) {
    if (!byKey.has(defaultRecord.key)) {
      byKey.set(defaultRecord.key, defaultRecord);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
};

const buildEffectiveConfigMap = (storedRecords = []) => {
  const map = {};
  for (const entry of buildEffectiveConfigList(storedRecords)) {
    map[entry.key] = entry.value;
  }
  return map;
};

const getConfigDefinition = (key) => APP_CONFIG_DEFINITIONS[key] || null;

module.exports = {
  APP_CONFIG_DEFINITIONS,
  buildDefaultConfigRecords,
  buildEffectiveConfigList,
  buildEffectiveConfigMap,
  getConfigDefinition,
  mergeDeep,
  prepareConfigValue,
};
