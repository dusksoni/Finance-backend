const SUPPORTED_LOAN_STRUCTURES = [
  "EMI",
  "BULLET",
  "STEP_UP",
  "STEP_DOWN",
  "SEASONAL",
];

const SUPPORTED_INTEREST_COMPUTATIONS = ["FLAT", "REDUCING", "DAILY_REDUCING"];
const SUPPORTED_FREQUENCIES = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"];
const SUPPORTED_ALLOCATION_COMPONENTS = ["FINE", "INTEREST", "PRINCIPAL"];
const SUPPORTED_DUE_ALLOCATION_ORDERS = ["OLDEST_DUE_FIRST", "NEWEST_DUE_FIRST"];
const SUPPORTED_ORIGINATION_CHANNELS = [
  "BRANCH",
  "FIELD_AGENT",
  "SELF_SERVE",
  "DEALER",
  "API",
];

const normalizeStringArray = (values = [], { uppercase = true } = {}) => {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .filter((value) => value !== undefined && value !== null && `${value}`.trim() !== "")
    .map((value) => `${value}`.trim());

  const transformed = uppercase ? normalized.map((value) => value.toUpperCase()) : normalized;
  return [...new Set(transformed)];
};

const DEFAULT_LOAN_PRODUCT_RULES = {
  product: {
    supportedLoanStructures: ["EMI"],
    defaultLoanStructure: "EMI",
    supportedInterestComputations: ["FLAT"],
    defaultInterestComputation: "FLAT",
    allowTopUp: false,
    allowRestructure: false,
    allowSettlement: false,
    allowWriteOff: false,
    allowTrancheDisbursal: false,
  },
  eligibility: {
    minPrincipal: 0,
    maxPrincipal: 100000000,
    minTenureMonths: 1,
    maxTenureMonths: 120,
    minInterestRate: 0,
    maxInterestRate: 100,
    minBorrowerAge: 18,
    maxBorrowerAge: 75,
    minimumGuarantors: 1,
    requireGuarantor: true,
  },
  fees: {
    // Processing fee: applied once at disbursement
    processingFeeType: "PERCENTAGE", // PERCENTAGE | FLAT
    processingFeeValue: 0,           // % of principal or flat amount
    processingFeeMinAmount: 0,       // Minimum processing fee floor (flat)
    processingFeeMaxAmount: 0,       // 0 = no cap
    processingFeeGstPercent: 18,     // GST on processing fee

    // Late payment / penal charge
    lateFeeType: "PERCENTAGE",       // PERCENTAGE | FLAT | PER_DAY_PERCENTAGE
    lateFeeValue: 0,                 // % of overdue EMI or flat per occurrence
    lateFeeGstPercent: 0,

    // Foreclosure fee
    foreclosureFeeType: "PERCENTAGE", // PERCENTAGE | FLAT
    foreclosureFeeValue: 0,           // % of outstanding principal or flat
    foreclosureFeeGstPercent: 18,

    // Bounce charge (for returned NACH/cheque)
    bounceChargeAmount: 0,            // Flat amount per bounce
    bounceChargeGstPercent: 18,

    // Insurance
    insuranceFeeType: "PERCENTAGE",   // PERCENTAGE | FLAT
    insuranceFeeValue: 0,             // % of principal or flat amount
    insuranceGstPercent: 18,
    insuranceMandatory: false,

    // Other administrative charges
    otherChargesGstPercent: 18,
  },
  charges: {
    allowProcessingCharges: true,
    allowRtoCharges: true,
    allowInsurance: true,
    allowOtherCharges: true,
    penalChargeType: "PERCENTAGE",
    allowForeclosure: true,
    foreclosureLockInMonths: 0,
    allowPartPayment: true,
  },
  repayment: {
    supportedFrequencies: ["MONTHLY"],
    defaultFrequency: "MONTHLY",
    dueAllocationOrder: "OLDEST_DUE_FIRST",
    componentAllocationOrder: ["FINE", "INTEREST", "PRINCIPAL"],
    allowAdvancePayment: true,
    allowPartialPayment: true,
    autoCloseOnZeroPending: true,
    dueDayEditable: true,
    maxDueDay: 28,
    moratoriumMonths: 0,
    coolingOffDays: 0,
  },
  documents: {
    requiredBorrowerDocuments: ["AADHAAR"],
    requiredGuarantorDocuments: [],
    requiredLoanDocuments: [],
  },
  collections: {
    autoCreateOnOverdue: true,
    autoAssignToBranchEmployee: false,
    promiseToPayGraceDays: 2,
    followUpAfterActionDays: 3,
    legalActionDpd: 90,
    settlementEligibleDpd: 120,
    writeOffEligibleDpd: 180,
  },
  workflow: {
    requireApproval: true,
    makerCheckerEnabled: false,
    allowEmployeeDrafts: true,
    allowEmployeeApproval: false,
    allowDisbursalWithoutDocuments: false,
    // Approval matrix: auto-approve below threshold, require approval above
    autoApprovalMaxAmount: 0,         // 0 = always require approval
    dualApprovalMinAmount: 0,         // 0 = dual approval not required
    eligibleBranchIds: [],
    eligibleChannels: ["BRANCH"],
  },
  publicAccess: {
    enablePublicPaymentPortal: true,
    allowManualPaymentRequest: true,
    requirePhoneVerification: true,
    sessionTtlMinutes: 30,
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

const numberFields = [
  ["eligibility.minPrincipal", 0, 1000000000],
  ["eligibility.maxPrincipal", 0, 1000000000],
  ["eligibility.minTenureMonths", 1, 600],
  ["eligibility.maxTenureMonths", 1, 600],
  ["eligibility.minInterestRate", 0, 1000],
  ["eligibility.maxInterestRate", 0, 1000],
  ["eligibility.minBorrowerAge", 18, 100],
  ["eligibility.maxBorrowerAge", 18, 100],
  ["eligibility.minimumGuarantors", 0, 20],
  ["charges.foreclosureLockInMonths", 0, 120],
  ["repayment.maxDueDay", 1, 31],
  ["repayment.moratoriumMonths", 0, 60],
  ["repayment.coolingOffDays", 0, 90],
  ["collections.promiseToPayGraceDays", 0, 90],
  ["collections.followUpAfterActionDays", 0, 90],
  ["collections.legalActionDpd", 1, 1000],
  ["collections.settlementEligibleDpd", 1, 1000],
  ["collections.writeOffEligibleDpd", 1, 1000],
  ["publicAccess.sessionTtlMinutes", 5, 1440],
  ["fees.processingFeeValue", 0, 100],
  ["fees.processingFeeMinAmount", 0, 1000000000],
  ["fees.processingFeeMaxAmount", 0, 1000000000],
  ["fees.processingFeeGstPercent", 0, 100],
  ["fees.lateFeeValue", 0, 100],
  ["fees.lateFeeGstPercent", 0, 100],
  ["fees.foreclosureFeeValue", 0, 100],
  ["fees.foreclosureFeeGstPercent", 0, 100],
  ["fees.bounceChargeAmount", 0, 1000000],
  ["fees.bounceChargeGstPercent", 0, 100],
  ["fees.insuranceFeeValue", 0, 100],
  ["fees.insuranceGstPercent", 0, 100],
  ["fees.otherChargesGstPercent", 0, 100],
  ["workflow.autoApprovalMaxAmount", 0, 1000000000],
  ["workflow.dualApprovalMinAmount", 0, 1000000000],
];

const booleanFields = [
  "product.allowTopUp",
  "product.allowRestructure",
  "product.allowSettlement",
  "product.allowWriteOff",
  "product.allowTrancheDisbursal",
  "eligibility.requireGuarantor",
  "charges.allowProcessingCharges",
  "charges.allowRtoCharges",
  "charges.allowInsurance",
  "charges.allowOtherCharges",
  "charges.allowForeclosure",
  "charges.allowPartPayment",
  "repayment.allowAdvancePayment",
  "repayment.allowPartialPayment",
  "repayment.autoCloseOnZeroPending",
  "repayment.dueDayEditable",
  "collections.autoCreateOnOverdue",
  "collections.autoAssignToBranchEmployee",
  "workflow.requireApproval",
  "workflow.makerCheckerEnabled",
  "workflow.allowEmployeeDrafts",
  "workflow.allowEmployeeApproval",
  "workflow.allowDisbursalWithoutDocuments",
  "publicAccess.enablePublicPaymentPortal",
  "publicAccess.allowManualPaymentRequest",
  "publicAccess.requirePhoneVerification",
  "fees.insuranceMandatory",
];

const arrayFields = [
  "product.supportedLoanStructures",
  "product.supportedInterestComputations",
  "repayment.supportedFrequencies",
  "repayment.componentAllocationOrder",
  "documents.requiredBorrowerDocuments",
  "documents.requiredGuarantorDocuments",
  "documents.requiredLoanDocuments",
  "workflow.eligibleBranchIds",
  "workflow.eligibleChannels",
];

const getValue = (obj, path) =>
  path.split(".").reduce((value, key) => (value == null ? value : value[key]), obj);

const validationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const normalizeLoanProductRules = (rules = null) => {
  const normalized = mergeDeep(DEFAULT_LOAN_PRODUCT_RULES, rules || {});

  normalized.product.supportedLoanStructures = normalizeStringArray(
    normalized.product.supportedLoanStructures
  );
  normalized.product.defaultLoanStructure = String(
    normalized.product.defaultLoanStructure || DEFAULT_LOAN_PRODUCT_RULES.product.defaultLoanStructure
  ).toUpperCase();

  normalized.product.supportedInterestComputations = normalizeStringArray(
    normalized.product.supportedInterestComputations
  );
  normalized.product.defaultInterestComputation = String(
    normalized.product.defaultInterestComputation ||
      DEFAULT_LOAN_PRODUCT_RULES.product.defaultInterestComputation
  ).toUpperCase();

  normalized.repayment.supportedFrequencies = normalizeStringArray(
    normalized.repayment.supportedFrequencies
  );
  normalized.repayment.defaultFrequency = String(
    normalized.repayment.defaultFrequency || DEFAULT_LOAN_PRODUCT_RULES.repayment.defaultFrequency
  ).toUpperCase();
  normalized.repayment.componentAllocationOrder = normalizeStringArray(
    normalized.repayment.componentAllocationOrder
  );
  normalized.repayment.dueAllocationOrder = String(
    normalized.repayment.dueAllocationOrder ||
      DEFAULT_LOAN_PRODUCT_RULES.repayment.dueAllocationOrder
  ).toUpperCase();

  normalized.documents.requiredBorrowerDocuments = normalizeStringArray(
    normalized.documents.requiredBorrowerDocuments
  );
  normalized.documents.requiredGuarantorDocuments = normalizeStringArray(
    normalized.documents.requiredGuarantorDocuments
  );
  normalized.documents.requiredLoanDocuments = normalizeStringArray(
    normalized.documents.requiredLoanDocuments
  );

  normalized.workflow.eligibleChannels = normalizeStringArray(normalized.workflow.eligibleChannels);

  return normalized;
};

const validateLoanProductRules = (rules = null) => {
  const normalized = normalizeLoanProductRules(rules);

  for (const [path, min, max] of numberFields) {
    const value = getValue(normalized, path);
    if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
      throw validationError(`Invalid value for ${path}`);
    }
  }

  for (const path of booleanFields) {
    if (typeof getValue(normalized, path) !== "boolean") {
      throw validationError(`Invalid boolean value for ${path}`);
    }
  }

  for (const path of arrayFields) {
    if (!Array.isArray(getValue(normalized, path))) {
      throw validationError(`Invalid list value for ${path}`);
    }
  }

  const minPrincipal = normalized.eligibility.minPrincipal;
  const maxPrincipal = normalized.eligibility.maxPrincipal;
  if (minPrincipal > maxPrincipal) {
    throw validationError("eligibility.minPrincipal cannot exceed eligibility.maxPrincipal");
  }

  const minTenure = normalized.eligibility.minTenureMonths;
  const maxTenure = normalized.eligibility.maxTenureMonths;
  if (minTenure > maxTenure) {
    throw validationError("eligibility.minTenureMonths cannot exceed eligibility.maxTenureMonths");
  }

  const minRate = normalized.eligibility.minInterestRate;
  const maxRate = normalized.eligibility.maxInterestRate;
  if (minRate > maxRate) {
    throw validationError("eligibility.minInterestRate cannot exceed eligibility.maxInterestRate");
  }

  const minAge = normalized.eligibility.minBorrowerAge;
  const maxAge = normalized.eligibility.maxBorrowerAge;
  if (minAge > maxAge) {
    throw validationError("eligibility.minBorrowerAge cannot exceed eligibility.maxBorrowerAge");
  }

  const supportedFrequencies = normalized.repayment.supportedFrequencies;
  if (!supportedFrequencies.includes(normalized.repayment.defaultFrequency)) {
    throw validationError("repayment.defaultFrequency must be included in repayment.supportedFrequencies");
  }

  if (!SUPPORTED_DUE_ALLOCATION_ORDERS.includes(normalized.repayment.dueAllocationOrder)) {
    throw validationError("repayment.dueAllocationOrder is invalid");
  }

  const componentAllocationOrder = normalized.repayment.componentAllocationOrder;
  if (
    componentAllocationOrder.length !== SUPPORTED_ALLOCATION_COMPONENTS.length ||
    componentAllocationOrder.some((component) => !SUPPORTED_ALLOCATION_COMPONENTS.includes(component))
  ) {
    throw validationError(
      "repayment.componentAllocationOrder must contain FINE, INTEREST, PRINCIPAL exactly once"
    );
  }

  if (!normalized.product.supportedLoanStructures.includes(normalized.product.defaultLoanStructure)) {
    throw validationError(
      "product.defaultLoanStructure must be included in product.supportedLoanStructures"
    );
  }

  if (
    normalized.product.supportedLoanStructures.some(
      (loanStructure) => !SUPPORTED_LOAN_STRUCTURES.includes(loanStructure)
    )
  ) {
    throw validationError("product.supportedLoanStructures contains an invalid value");
  }

  if (
    !normalized.product.supportedInterestComputations.includes(
      normalized.product.defaultInterestComputation
    )
  ) {
    throw validationError(
      "product.defaultInterestComputation must be included in product.supportedInterestComputations"
    );
  }

  if (
    normalized.product.supportedInterestComputations.some(
      (interestComputation) => !SUPPORTED_INTEREST_COMPUTATIONS.includes(interestComputation)
    )
  ) {
    throw validationError("product.supportedInterestComputations contains an invalid value");
  }

  if (
    supportedFrequencies.some((frequency) => !SUPPORTED_FREQUENCIES.includes(frequency))
  ) {
    throw validationError("repayment.supportedFrequencies contains an invalid value");
  }

  if (
    normalized.workflow.eligibleChannels.some(
      (channel) => !SUPPORTED_ORIGINATION_CHANNELS.includes(channel)
    )
  ) {
    throw validationError("workflow.eligibleChannels contains an invalid value");
  }

  if (normalized.eligibility.requireGuarantor && normalized.eligibility.minimumGuarantors < 1) {
    throw validationError("minimumGuarantors must be at least 1 when requireGuarantor is enabled");
  }

  if (
    normalized.collections.legalActionDpd > normalized.collections.settlementEligibleDpd ||
    normalized.collections.settlementEligibleDpd > normalized.collections.writeOffEligibleDpd
  ) {
    throw validationError(
      "collections thresholds must be in ascending order: legalActionDpd <= settlementEligibleDpd <= writeOffEligibleDpd"
    );
  }

  const SUPPORTED_FEE_TYPES = ["PERCENTAGE", "FLAT", "PER_DAY_PERCENTAGE"];
  const feeTypeFields = [
    ["fees.processingFeeType", ["PERCENTAGE", "FLAT"]],
    ["fees.lateFeeType", SUPPORTED_FEE_TYPES],
    ["fees.foreclosureFeeType", ["PERCENTAGE", "FLAT"]],
    ["fees.insuranceFeeType", ["PERCENTAGE", "FLAT"]],
  ];
  for (const [path, allowed] of feeTypeFields) {
    const val = getValue(normalized, path);
    if (!allowed.includes(String(val || "").toUpperCase())) {
      throw validationError(`${path} must be one of: ${allowed.join(", ")}`);
    }
  }

  if (
    normalized.workflow.dualApprovalMinAmount > 0 &&
    normalized.workflow.autoApprovalMaxAmount > 0 &&
    normalized.workflow.dualApprovalMinAmount <= normalized.workflow.autoApprovalMaxAmount
  ) {
    throw validationError(
      "workflow.dualApprovalMinAmount must be greater than workflow.autoApprovalMaxAmount"
    );
  }

  return normalized;
};

const getRepaymentPolicy = (rules = null) => {
  const normalized = normalizeLoanProductRules(rules);
  return {
    ...normalized.repayment,
    allowPartialPayment:
      normalized.repayment.allowPartialPayment && normalized.charges.allowPartPayment,
  };
};

const getCollectionPolicy = (rules = null) => normalizeLoanProductRules(rules).collections;

const getWorkflowPolicy = (rules = null) => normalizeLoanProductRules(rules).workflow;

const getFeePolicy = (rules = null) => normalizeLoanProductRules(rules).fees;

/**
 * Calculate processing fee for a given principal using product fee rules.
 * Returns { baseFee, gstAmount, totalFee }
 */
const calculateProcessingFee = (rules, principalAmount) => {
  const fees = getFeePolicy(rules);
  const principal = Number(principalAmount) || 0;
  let baseFee = 0;
  if (fees.processingFeeType === "PERCENTAGE") {
    baseFee = (principal * fees.processingFeeValue) / 100;
    if (fees.processingFeeMinAmount > 0) baseFee = Math.max(baseFee, fees.processingFeeMinAmount);
    if (fees.processingFeeMaxAmount > 0) baseFee = Math.min(baseFee, fees.processingFeeMaxAmount);
  } else {
    baseFee = fees.processingFeeValue;
  }
  const gstAmount = (baseFee * fees.processingFeeGstPercent) / 100;
  return { baseFee: Math.round(baseFee), gstAmount: Math.round(gstAmount), totalFee: Math.round(baseFee + gstAmount) };
};

module.exports = {
  DEFAULT_LOAN_PRODUCT_RULES,
  SUPPORTED_ALLOCATION_COMPONENTS,
  normalizeLoanProductRules,
  validateLoanProductRules,
  getRepaymentPolicy,
  getCollectionPolicy,
  getWorkflowPolicy,
  getFeePolicy,
  calculateProcessingFee,
};
