const { differenceInYears } = require("date-fns");
const { normalizeLoanProductRules } = require("./loanTypeRules");

const LOAN_DOCUMENT_FIELD_MAP = {
  INVOICE: "loanInvoiceDoc",
  INSURANCE: "insuranceDoc",
  REGISTRATION: "registrationDoc",
};

const normalizeDocNames = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean);

const validationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const assertLoanMatchesProductRules = ({
  rules,
  principalLoanAmount,
  interestRate,
  tenureMonths,
  paymentFrequency,
  dueDay,
  borrowerDateOfBirth,
  branchId,
}) => {
  const normalized = normalizeLoanProductRules(rules);
  const principal = Number(principalLoanAmount);
  const rate = Number(interestRate);
  const tenure = Number(tenureMonths);
  const frequency = String(paymentFrequency || "MONTHLY").toUpperCase();

  if (principal < normalized.eligibility.minPrincipal || principal > normalized.eligibility.maxPrincipal) {
    throw validationError(
      `Principal amount must be between ${normalized.eligibility.minPrincipal} and ${normalized.eligibility.maxPrincipal}`
    );
  }

  if (tenure < normalized.eligibility.minTenureMonths || tenure > normalized.eligibility.maxTenureMonths) {
    throw validationError(
      `Tenure must be between ${normalized.eligibility.minTenureMonths} and ${normalized.eligibility.maxTenureMonths} months`
    );
  }

  if (rate < normalized.eligibility.minInterestRate || rate > normalized.eligibility.maxInterestRate) {
    throw validationError(
      `Interest rate must be between ${normalized.eligibility.minInterestRate} and ${normalized.eligibility.maxInterestRate}`
    );
  }

  if (!normalized.repayment.supportedFrequencies.includes(frequency)) {
    throw validationError(
      `Payment frequency ${frequency} is not allowed for this loan product`
    );
  }

  if (
    Array.isArray(normalized.workflow.eligibleBranchIds) &&
    normalized.workflow.eligibleBranchIds.length > 0 &&
    branchId &&
    !normalized.workflow.eligibleBranchIds.includes(branchId)
  ) {
    throw validationError("This branch is not eligible for the selected loan product");
  }

  if (dueDay !== undefined && dueDay !== null) {
    const due = Number(dueDay);
    if (Number.isFinite(due) && due > normalized.repayment.maxDueDay) {
      throw validationError(`Due day cannot exceed ${normalized.repayment.maxDueDay} for this loan product`);
    }
  }

  if (borrowerDateOfBirth) {
    const age = differenceInYears(new Date(), new Date(borrowerDateOfBirth));
    if (age < normalized.eligibility.minBorrowerAge || age > normalized.eligibility.maxBorrowerAge) {
      throw validationError(
        `Borrower age must be between ${normalized.eligibility.minBorrowerAge} and ${normalized.eligibility.maxBorrowerAge}`
      );
    }
  }

  return normalized;
};

const assertLoanGuarantorRequirements = ({ rules, guarantorIds = [] }) => {
  const normalized = normalizeLoanProductRules(rules);
  const uniqueGuarantorIds = [...new Set((Array.isArray(guarantorIds) ? guarantorIds : []).filter(Boolean))];

  if (
    normalized.eligibility.requireGuarantor &&
    uniqueGuarantorIds.length < normalized.eligibility.minimumGuarantors
  ) {
    throw validationError(
      `At least ${normalized.eligibility.minimumGuarantors} guarantor(s) are required for this loan product`
    );
  }

  return uniqueGuarantorIds;
};

const assertLoanDocumentationRequirements = ({
  rules,
  borrowerPhotoIds = [],
  guarantorPhotoIds = [],
  loanDocumentPresence = {},
}) => {
  const normalized = normalizeLoanProductRules(rules);
  const borrowerDocuments = new Set(
    (Array.isArray(borrowerPhotoIds) ? borrowerPhotoIds : [])
      .map((item) => item?.photoIdType?.name)
      .filter(Boolean)
      .map((item) => String(item).trim().toUpperCase())
  );

  const missingBorrowerDocuments = normalizeDocNames(
    normalized.documents.requiredBorrowerDocuments
  ).filter((documentName) => !borrowerDocuments.has(documentName));

  if (missingBorrowerDocuments.length > 0) {
    throw validationError(
      `Borrower is missing required documents: ${missingBorrowerDocuments.join(", ")}`
    );
  }

  const requiredGuarantorDocuments = normalizeDocNames(
    normalized.documents.requiredGuarantorDocuments
  );

  if (requiredGuarantorDocuments.length > 0) {
    for (const guarantor of Array.isArray(guarantorPhotoIds) ? guarantorPhotoIds : []) {
      const available = new Set(
        (guarantor?.photoIds || [])
          .map((item) => item?.photoIdType?.name)
          .filter(Boolean)
          .map((item) => String(item).trim().toUpperCase())
      );
      const missing = requiredGuarantorDocuments.filter((documentName) => !available.has(documentName));
      if (missing.length > 0) {
        throw validationError(
          `Guarantor ${guarantor?.id || ""} is missing required documents: ${missing.join(", ")}`
        );
      }
    }
  }

  const missingLoanDocuments = normalized.workflow.allowDisbursalWithoutDocuments
    ? []
    : normalizeDocNames(normalized.documents.requiredLoanDocuments).filter((documentName) => {
        const field = LOAN_DOCUMENT_FIELD_MAP[documentName];
        if (!field) return false;
        return !loanDocumentPresence[field];
      });

  if (missingLoanDocuments.length > 0) {
    throw validationError(
      `Loan is missing required documents: ${missingLoanDocuments.join(", ")}`
    );
  }
};

const assertLoanApprovalWorkflow = ({
  rules,
  loan,
  approverType,
  approverAdminId,
  approverEmployeeId,
}) => {
  const normalized = normalizeLoanProductRules(rules);

  if (approverType === "EMPLOYEE" && !normalized.workflow.allowEmployeeApproval) {
    throw validationError("Employees are not allowed to approve this loan product");
  }

  if (
    normalized.workflow.makerCheckerEnabled &&
    ((approverAdminId && loan?.adminId && approverAdminId === loan.adminId) ||
      (approverEmployeeId && loan?.employeeId && approverEmployeeId === loan.employeeId))
  ) {
    throw validationError("Maker-checker is enabled. The creator cannot approve this loan");
  }
};

module.exports = {
  assertLoanMatchesProductRules,
  assertLoanGuarantorRequirements,
  assertLoanDocumentationRequirements,
  assertLoanApprovalWorkflow,
  LOAN_DOCUMENT_FIELD_MAP,
};
