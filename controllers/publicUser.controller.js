// publicUser.controller.js - Public APIs for users to access loan info via loan ID only (no auth required)
const prisma = require("../lib/prisma");
const Decimal = require("decimal.js");
const { calculateFine } = require("../utils/calculateFine");
const {
  shouldUpdateLoanFines,
  markLoanFinesUpdated,
} = require("../utils/fineUpdateCache");
const { processPostPayment } = require("../utils/loanUtils");
const { generateQR: gatewayGenerateQR, checkStatus: gatewayCheckStatus } = require("../utils/paymentGateway");
const {
  buildPublicLoanLookupWhere,
  createRawPublicAccessToken,
  getTokenTtlMinutes,
  hashPublicAccessToken,
  matchesBorrowerVerification,
  normalizeIdentifier,
  normalizePhone,
} = require("../utils/publicAccess");
const { buildEffectiveConfigMap } = require("../utils/appConfig");
const { getRepaymentPolicy } = require("../utils/loanTypeRules");
const {
  buildGrievanceTicketNumber,
  calculateDueAtForPriority,
  getGrievanceSettings,
  resolveGrievanceCategory,
  resolveGrievancePriority,
} = require("../utils/grievanceConfig");
const {
  distributeAcrossComponents,
  getSortedInstallments,
} = require("../utils/paymentAllocation");


// Configure Decimal.js for precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Helper for precise rounding
const r2 = (n) => new Decimal(n || 0).toDecimalPlaces(2).toNumber();

const ALLOWED_PUBLIC_FILE_STATUSES = [
  "ACTIVE",
  "OVERDUE",
  "DEFAULTED",
  "DISBURSED",
  "CLOSED",
  "SEIZED",
  "SEIZED_INITIATED",
];

const maskPhone = (value) => {
  const normalized = normalizePhone(value);
  if (!normalized) return null;
  return `${"*".repeat(Math.max(normalized.length - 4, 0))}${normalized.slice(-4)}`;
};

const maskEmail = (value) => {
  const email = String(value || "").trim();
  if (!email || !email.includes("@")) return null;
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return null;
  if (localPart.length <= 2) {
    return `${localPart[0] || "*"}*@${domain}`;
  }
  return `${localPart[0]}${"*".repeat(localPart.length - 2)}${localPart.slice(-1)}@${domain}`;
};

const buildBorrowerName = (user) =>
  [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(" ");

const getPublicPortalConfig = async () => {
  const records = await prisma.appConfig.findMany({
    where: {
      key: {
        in: [
          "public_portal.payment",
          "security.public_access",
          "branding.company_profile",
          "branding.receipt_preferences",
        ],
      },
    },
  });

  const configs = buildEffectiveConfigMap(records);
  return {
    publicPortal: {
      enabled: true,
      allowManualPaymentRequest: true,
      allowReceiptDownload: true,
      allowPaymentHistory: true,
      allowLoanSummary: true,
      allowStatementDownload: true,
      allowDueCalendar: true,
      requirePhoneVerification: true,
      sessionTtlMinutes: 30,
      ...(configs["public_portal.payment"] || {}),
    },
    publicAccessSecurity: {
      requireAccessToken: false,
      maxConcurrentSessionsPerLoan: 3,
      verificationMethods: ["PHONE", "DOB"],
      tokenTtlMinutes: 30,
      ...(configs["security.public_access"] || {}),
    },
    companyProfile: configs["branding.company_profile"] || {},
    receiptPreferences: configs["branding.receipt_preferences"] || {},
  };
};

const resolvePublicLoanByIdentifier = async (identifier, extraInclude = {}) =>
  prisma.loan.findFirst({
    where: buildPublicLoanLookupWhere(normalizeIdentifier(identifier)),
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          phone: true,
          email: true,
          dateOfBirth: true,
        },
      },
      ...extraInclude,
    },
  });

const resolveAccessiblePublicLoan = async (identifier, extraInclude = {}) => {
  const loan = await resolvePublicLoanByIdentifier(identifier, extraInclude);
  if (!loan) {
    const error = new Error("Loan not found");
    error.statusCode = 404;
    throw error;
  }

  if (!ALLOWED_PUBLIC_FILE_STATUSES.includes(loan.fileStatus)) {
    const error = new Error("Loan information not available");
    error.statusCode = 403;
    throw error;
  }

  return loan;
};

const getResolvedPublicLoanId = (req) =>
  req.publicLoanId || req.publicAccessSession?.loanId || normalizeIdentifier(req.params.loanId);

const buildPublicAssetSummary = (loan) => {
  if (loan.twoWheelerLoan) {
    return {
      category: "TWO_WHEELER",
      registrationNumber: loan.twoWheelerLoan.registrationNumber || null,
      brand: loan.twoWheelerLoan.brand?.name || null,
      model: loan.twoWheelerLoan.model?.name || null,
      variant: loan.twoWheelerLoan.variant?.name || null,
    };
  }

  if (loan.agriLoan) {
    return {
      category: "AGRI",
      registrationNumber: loan.agriLoan.registrationNumber || null,
      equipment: loan.agriLoan.equipment?.name || null,
      usageArea: loan.agriLoan.usageArea || null,
    };
  }

  if (loan.msmeLoan) {
    return {
      category: "MSME",
      registrationNumber: loan.msmeLoan.registrationNumber || null,
      businessName: loan.msmeLoan.businessName || null,
      businessType: loan.msmeLoan.businessType || null,
    };
  }

  return null;
};

const buildPublicLoanSummary = (loan) => {
  const unpaidEmis = Array.isArray(loan.emi)
    ? loan.emi.filter((emi) => ["UNPAID", "PARTIAL", "VERIFICATION_PENDING"].includes(emi.status))
    : [];

  const nextDue = unpaidEmis
    .slice()
    .sort((left, right) => new Date(left.paymentFor) - new Date(right.paymentFor))[0];

  return {
    loanId: loan.id,
    fileNo: loan.fileNo,
    fileStatus: loan.fileStatus,
    status: loan.fileStatus,
    loanType: loan.loanType?.label || loan.loanType?.name || null,
    branch: loan.branch
      ? {
          id: loan.branch.id,
          name: loan.branch.name,
          address: loan.branch.address || null,
          phone: loan.branch.phone || null,
        }
      : null,
    borrower: {
      name: buildBorrowerName(loan.user),
      maskedPhone: maskPhone(loan.user?.phone),
      maskedEmail: maskEmail(loan.user?.email),
    },
    principalLoanAmount: Number(loan.principalLoanAmount),
    principalAmount: Number(loan.principalLoanAmount),
    interestRate: Number(loan.interestRate),
    totalAmount: Number(loan.totalAmount),
    totalPaidAmount: Number(loan.totalPaidAmount),
    pendingAmount: Number(loan.pendingAmount),
    totalPaidPrincipal: Number(loan.totalPaidPrincipal || 0),
    totalPaidInterest: Number(loan.totalPaidInterest || 0),
    totalPaidFine: Number(loan.totalPaidFine || 0),
    tenureMonths: loan.tenureMonths,
    dueDay: loan.dueDay,
    paymentFrequency: loan.paymentFrequency,
    startDate: loan.startDate,
    endDate: loan.endDate,
    isClosed: loan.isClosed,
    isDefaulted: loan.isDefaulted,
    nextDue: nextDue
      ? {
          emiId: nextDue.id,
          dueDate: nextDue.paymentFor,
          status: nextDue.status,
          emiAmount: Number(nextDue.emiPayAmount || 0),
          amountPaid: Number(nextDue.amountPaidSoFar || 0),
          fineDue: Math.max(Number(nextDue.fineAmount || 0) - Number(nextDue.finePaid || 0), 0),
        }
      : null,
    emiCount: Array.isArray(loan.emi) ? loan.emi.length : 0,
    pendingEmiCount: unpaidEmis.length,
    paymentsCount: Array.isArray(loan.payments) ? loan.payments.length : 0,
    asset: buildPublicAssetSummary(loan),
    guarantors: Array.isArray(loan.guarantors)
      ? loan.guarantors.map((lg) => ({
          name: buildBorrowerName(lg.guarantor),
          maskedPhone: maskPhone(lg.guarantor?.phone),
        }))
      : [],
  };
};

const buildPublicLoanStatement = (loan) => ({
  loanDetails: {
    fileNo: loan.fileNo,
    loanType: loan.loanType?.label || loan.loanType?.name || null,
    borrowerName: buildBorrowerName(loan.user),
    borrowerPhone: maskPhone(loan.user?.phone),
    borrowerEmail: maskEmail(loan.user?.email),
    branch: loan.branch?.name || null,
    principalAmount: r2(loan.principalLoanAmount),
    interestRate: Number(loan.interestRate || 0),
    interestAmount: r2(loan.interestAmount),
    totalAmount: r2(loan.totalAmount),
    tenureMonths: loan.tenureMonths,
    startDate: loan.startDate,
    endDate: loan.endDate,
    disbursedDate: loan.disbursedDate,
    status: loan.fileStatus,
    isClosed: loan.isClosed,
    isForeclosed: loan.isForeclosed,
    asset: buildPublicAssetSummary(loan),
  },
  summary: {
    totalPaidAmount: r2(loan.totalPaidAmount),
    totalPaidPrincipal: r2(loan.totalPaidPrincipal),
    totalPaidInterest: r2(loan.totalPaidInterest),
    totalPaidFine: r2(loan.totalPaidFine),
    pendingAmount: r2(loan.pendingAmount),
    totalDelayDays: loan.totalDelayDays,
  },
  emiSchedule: (loan.emi || []).map((emi, index) => ({
    sNo: index + 1,
    dueDate: emi.paymentFor,
    emiAmount: r2(emi.emiPayAmount),
    principalComponent: r2(emi.principalAmt),
    interestComponent: r2(emi.interestAmt),
    fineAssessed: r2(emi.fineAmount),
    amountPaid: r2(emi.amountPaidSoFar),
    principalPaid: r2(emi.principalPaid),
    interestPaid: r2(emi.interestPaid),
    finePaid: r2(emi.finePaid),
    status: emi.status,
    delayDays: emi.delayDays || 0,
  })),
  payments: (loan.payments || []).map((payment, index) => ({
    sNo: index + 1,
    paymentDate: payment.paymentDate,
    amount: r2(payment.amount),
    mode: payment.paymentMode,
    transactionId: payment.transactionId,
    status: payment.status,
    verified: payment.verified,
    isForeclosure: payment.isForeclosure,
  })),
});

const buildPublicGrievanceResponse = (ticket) => ({
  id: ticket.id,
  ticketNumber: ticket.ticketNumber,
  category: ticket.category,
  subject: ticket.subject,
  description: ticket.description,
  status: ticket.status,
  priority: ticket.priority,
  source: ticket.source,
  dueAt: ticket.dueAt,
  firstResponseAt: ticket.firstResponseAt,
  resolvedAt: ticket.resolvedAt,
  resolutionSummary: ticket.resolutionSummary,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
  comments: Array.isArray(ticket.comments)
    ? ticket.comments
        .filter((comment) => !comment.isInternal)
        .map((comment) => ({
          id: comment.id,
          message: comment.message,
          createdAt: comment.createdAt,
        }))
    : [],
});

const getPublicPortalSessionTtlMinutes = async () => {
  try {
    const { publicPortal, publicAccessSecurity } = await getPublicPortalConfig();
    return getTokenTtlMinutes(
      publicAccessSecurity.tokenTtlMinutes || publicPortal.sessionTtlMinutes
    );
  } catch {
    return getTokenTtlMinutes(null);
  }
};

exports.requestPublicAccess = async (req, res) => {
  try {
    const { identifier, phone, dateOfBirth } = req.body || {};
    const { publicPortal, publicAccessSecurity } = await getPublicPortalConfig();

    if (!publicPortal.enabled) {
      return res.status(403).json({
        status: 403,
        error: "Borrower self-service portal is currently disabled",
      });
    }

    if (!identifier || (!phone && !dateOfBirth)) {
      return res.status(400).json({
        status: 400,
        error: "identifier and either phone or dateOfBirth are required",
      });
    }

    if (
      publicPortal.requirePhoneVerification &&
      !phone &&
      publicAccessSecurity.verificationMethods?.includes("PHONE")
    ) {
      return res.status(400).json({
        status: 400,
        error: "Phone verification is required for borrower access",
      });
    }

    const allowedVerificationMethods = Array.isArray(publicAccessSecurity.verificationMethods)
      ? publicAccessSecurity.verificationMethods.map((method) => `${method}`.toUpperCase())
      : ["PHONE", "DOB"];

    if (phone && !allowedVerificationMethods.includes("PHONE")) {
      return res.status(400).json({
        status: 400,
        error: "Phone verification is not enabled for borrower access",
      });
    }

    if (dateOfBirth && !allowedVerificationMethods.includes("DOB")) {
      return res.status(400).json({
        status: 400,
        error: "Date-of-birth verification is not enabled for borrower access",
      });
    }

    const loan = await resolveAccessiblePublicLoan(identifier);

    if (!matchesBorrowerVerification(loan, { phone, dateOfBirth })) {
      return res.status(401).json({
        status: 401,
        error: "Borrower verification failed",
      });
    }

    await prisma.publicAccessSession.updateMany({
      where: {
        loanId: loan.id,
        expiresAt: { lt: new Date() },
        status: "ACTIVE",
      },
      data: { status: "EXPIRED" },
    });

    const activeSessions = await prisma.publicAccessSession.findMany({
      where: {
        loanId: loan.id,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const maxConcurrentSessions = Math.max(
      Number(publicAccessSecurity.maxConcurrentSessionsPerLoan || 3),
      1
    );

    const sessionsToExpire = Math.max(activeSessions.length - maxConcurrentSessions + 1, 0);
    if (sessionsToExpire > 0) {
      await prisma.publicAccessSession.updateMany({
        where: {
          id: {
            in: activeSessions.slice(0, sessionsToExpire).map((session) => session.id),
          },
        },
        data: { status: "REPLACED" },
      });
    }

    const rawToken = createRawPublicAccessToken();
    const ttlMinutes = await getPublicPortalSessionTtlMinutes();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await prisma.publicAccessSession.create({
      data: {
        loanId: loan.id,
        accessTokenHash: hashPublicAccessToken(rawToken),
        verificationMethod: phone ? "PHONE" : "DOB",
        context: {
          identifier: normalizeIdentifier(identifier),
          maskedPhone: maskPhone(loan.user?.phone),
          ipAddress: req.ip || null,
        },
        expiresAt,
      },
    });

    return res.json({
      status: 200,
      data: {
        loanId: loan.id,
        fileNo: loan.fileNo,
        accessToken: rawToken,
        expiresAt,
        borrower: {
          name: [loan.user?.firstName, loan.user?.middleName, loan.user?.lastName]
            .filter(Boolean)
            .join(" "),
          maskedPhone: maskPhone(loan.user?.phone),
        },
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: error.statusCode || 500,
      error: "Failed to create public access session",
      message: error.message,
    });
  }
};

exports.getPublicAccessSession = async (req, res) => {
  try {
    if (!req.publicAccessSession?.loanId) {
      return res.status(401).json({
        status: 401,
        error: "Public access session not found",
      });
    }

    const loan = await resolveAccessiblePublicLoan(req.publicAccessSession.loanId, {
      loanType: {
        select: {
          id: true,
          name: true,
          label: true,
        },
      },
      branch: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
        },
      },
      emi: {
        orderBy: { paymentFor: "asc" },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
        take: 10,
      },
    });

    return res.json({
      status: 200,
      data: {
        session: {
          id: req.publicAccessSession.id,
          loanId: req.publicAccessSession.loanId,
          verificationMethod: req.publicAccessSession.verificationMethod,
          expiresAt: req.publicAccessSession.expiresAt,
          lastUsedAt: req.publicAccessSession.lastUsedAt,
        },
        summary: buildPublicLoanSummary(loan),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: error.statusCode || 500,
      error: error.message || "Failed to fetch public session",
    });
  }
};

exports.createPublicGrievance = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    if (!publicPortal.allowPublicGrievance) {
      return res.status(403).json({
        status: 403,
        error: "Public grievance creation is disabled",
      });
    }

    const loan = await resolveAccessiblePublicLoan(getResolvedPublicLoanId(req), {
      branch: {
        select: {
          id: true,
        },
      },
      user: {
        select: {
          id: true,
        },
      },
    });
    const settings = await getGrievanceSettings(prisma);
    const { category, subject, description, priority, metadata } = req.body || {};

    if (!category || !subject || !description) {
      return res.status(400).json({
        status: 400,
        error: "category, subject, and description are required",
      });
    }

    const normalizedCategory = resolveGrievanceCategory(settings, category, { isPublic: true });
    const normalizedPriority = resolveGrievancePriority(settings, priority, { isPublic: true });
    const ticketNumber = await buildGrievanceTicketNumber(prisma, settings.ticketPrefix);

    const ticket = await prisma.grievanceTicket.create({
      data: {
        ticketNumber,
        category: normalizedCategory,
        subject,
        description,
        priority: normalizedPriority,
        source: "WEB",
        userId: loan.userId,
        loanId: loan.id,
        branchId: loan.branchId || null,
        metadata: {
          ...(metadata || {}),
          publicAccessSessionId: req.publicAccessSession?.id || null,
          createdFrom: "BORROWER_SELF_SERVICE",
        },
        dueAt: calculateDueAtForPriority(settings, normalizedPriority),
      },
      include: {
        comments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    await logAction({
      action: "PUBLIC_CREATED_GRIEVANCE",
      table: "GrievanceTicket",
      targetId: ticket.id,
      metadata: {
        loanId: loan.id,
        ticketNumber: ticket.ticketNumber,
      },
    });

    return res.status(201).json({
      status: 201,
      message: "Grievance created successfully",
      data: buildPublicGrievanceResponse(ticket),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: error.statusCode || 500,
      error: error.message || "Failed to create grievance",
    });
  }
};

exports.listPublicGrievances = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    if (!publicPortal.allowPublicGrievance) {
      return res.status(403).json({
        status: 403,
        error: "Public grievance view is disabled",
      });
    }

    const loanId = getResolvedPublicLoanId(req);
    const tickets = await prisma.grievanceTicket.findMany({
      where: {
        loanId,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        comments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return res.json({
      status: 200,
      data: tickets.map(buildPublicGrievanceResponse),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: error.statusCode || 500,
      error: error.message || "Failed to fetch grievances",
    });
  }
};

exports.addPublicGrievanceComment = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    const settings = await getGrievanceSettings(prisma);
    if (!publicPortal.allowPublicGrievanceComments || !settings.publicCommentEnabled) {
      return res.status(403).json({
        status: 403,
        error: "Public grievance comments are disabled",
      });
    }

    const { message } = req.body || {};
    if (!message) {
      return res.status(400).json({
        status: 400,
        error: "message is required",
      });
    }

    const loanId = getResolvedPublicLoanId(req);
    const ticket = await prisma.grievanceTicket.findFirst({
      where: {
        id: req.params.id,
        loanId,
      },
    });

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        error: "Grievance ticket not found",
      });
    }

    const comment = await prisma.grievanceComment.create({
      data: {
        ticketId: ticket.id,
        message,
        isInternal: false,
      },
    });

    await prisma.grievanceTicket.update({
      where: { id: ticket.id },
      data: {
        status: ["RESOLVED", "CLOSED"].includes(ticket.status) ? "IN_PROGRESS" : ticket.status,
      },
    });

    await logAction({
      action: "PUBLIC_ADDED_GRIEVANCE_COMMENT",
      table: "GrievanceComment",
      targetId: comment.id,
      metadata: {
        ticketId: ticket.id,
        loanId,
      },
    });

    return res.status(201).json({
      status: 201,
      message: "Comment added successfully",
      data: {
        id: comment.id,
        message: comment.message,
        createdAt: comment.createdAt,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: error.statusCode || 500,
      error: error.message || "Failed to add grievance comment",
    });
  }
};

/**
 * GET /api/public/loan/:loanId
 * Get basic loan details by loan ID (unauthenticated)
 * Returns: loan info, user details, guarantor info, payment summary
 */
exports.getPublicLoanDetails = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    if (!publicPortal.allowLoanSummary) {
      return res.status(403).json({
        status: 403,
        error: "Loan summary is not available in borrower self-service",
      });
    }

    const loan = await resolveAccessiblePublicLoan(getResolvedPublicLoanId(req), {
      emi: {
        orderBy: { paymentFor: "asc" },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
        take: 10,
      },
      twoWheelerLoan: {
        include: {
          brand: true,
          model: true,
          variant: true,
        },
      },
      agriLoan: {
        include: {
          equipment: true,
        },
      },
      msmeLoan: true,
      user: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
      loanType: {
        select: {
          id: true,
          name: true,
          label: true,
        },
      },
      branch: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
        },
      },
      guarantors: {
        include: {
          guarantor: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              phone: true,
            },
          },
        },
      },
    });

    return res.json({
      status: 200,
      data: buildPublicLoanSummary(loan),
    });
  } catch (err) {
    console.error("getPublicLoanDetails error:", err);
    return res.status(err.statusCode || 500).json({ error: err.message, status: err.statusCode || 500 });
  }
};

exports.getPublicLoanStatement = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    if (!publicPortal.allowStatementDownload) {
      return res.status(403).json({
        status: 403,
        error: "Loan statement is not available in borrower self-service",
      });
    }

    const loan = await resolveAccessiblePublicLoan(getResolvedPublicLoanId(req), {
      loanType: true,
      branch: true,
      emi: {
        orderBy: { paymentFor: "asc" },
      },
      payments: {
        orderBy: { paymentDate: "asc" },
      },
      twoWheelerLoan: { include: { brand: true, model: true, variant: true } },
      agriLoan: { include: { equipment: true } },
      msmeLoan: true,
    });

    return res.json({
      status: 200,
      data: buildPublicLoanStatement(loan),
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      status: err.statusCode || 500,
      error: err.message || "Failed to fetch loan statement",
    });
  }
};

/**
 * GET /api/public/loan/:loanId/payments/pending
 * Get pending EMI list with fine calculations (unauthenticated)
 */
exports.getPublicPendingPayments = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    if (!publicPortal.allowDueCalendar) {
      return res.status(403).json({
        status: 403,
        error: "Due calendar is not available in borrower self-service",
      });
    }

    const today = new Date();
    const loan = await resolveAccessiblePublicLoan(getResolvedPublicLoanId(req), {
      loanType: {
        select: {
          rules: true,
        },
      },
    });
    const loanId = loan.id;

    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED"].includes(loan.fileStatus)) {
      return res.status(403).json({
        error: "No pending payments for this loan",
        status: 403
      });
    }

    // Update fines if stale (DB-based check, works across PM2 processes)
    if (await shouldUpdateLoanFines(prisma, loanId)) {
      const toRefresh = await prisma.eMI.findMany({
        where: {
          loanId,
          status: { in: ["UNPAID", "PARTIAL"] },
          paymentFor: { lte: today },
        },
        select: {
          id: true,
          paymentFor: true,
          emiPayAmount: true,
          amountPaidSoFar: true,
          finePaid: true,
          fineAmount: true,
          delayDays: true,
          isDelayed: true,
        },
        orderBy: [{ paymentFor: "asc" }, { id: "asc" }],
      });

      const updates = toRefresh.map(async (e) => {
        const emiPaidComponent = new Decimal(e.amountPaidSoFar || 0)
          .minus(new Decimal(e.finePaid || 0))
          .toNumber();

        const outstanding = Math.max(
          new Decimal(e.emiPayAmount || 0).minus(emiPaidComponent).toNumber(),
          0
        );

        const storedFine = r2(e.fineAmount || 0);
        const storedDelay = Number(e.delayDays || 0);
        const storedIsDelayed = Boolean(e.isDelayed || storedDelay > 0);

        let newFine = storedFine;
        let newDelay = storedDelay;
        let isDelayed = storedIsDelayed;

        if (outstanding > 0) {
          const { daysLate, fineAmt } = calculateFine(
            e.paymentFor,
            outstanding
          );
          newFine = r2(fineAmt);
          newDelay = Number(daysLate || 0);
          isDelayed = newDelay > 0;
        }

        if (
          storedFine !== newFine ||
          storedDelay !== newDelay ||
          storedIsDelayed !== isDelayed
        ) {
          return prisma.eMI.update({
            where: { id: e.id },
            data: { fineAmount: newFine, delayDays: newDelay, isDelayed },
          });
        }
        return null;
      });

      await Promise.all(updates);
      await markLoanFinesUpdated(prisma, loanId);
    }

    // Fetch pending EMIs
    const rawInstallments = await prisma.eMI.findMany({
      where: {
        loanId,
        status: { in: ["UNPAID", "PARTIAL"] },
      },
    });
    const repaymentPolicy = getRepaymentPolicy(loan.loanType?.rules);
    const installments = getSortedInstallments(
      rawInstallments.filter((inst) =>
        repaymentPolicy.allowAdvancePayment ? true : new Date(inst.paymentFor) <= today
      ),
      loan.loanType?.rules
    );

    let grandTotal = new Decimal(0);
    const pending = installments.map((inst) => {
      const emiPaidComponent = new Decimal(inst.amountPaidSoFar || 0)
        .minus(new Decimal(inst.finePaid || 0))
        .toNumber();

      const outstanding = Math.max(
        new Decimal(inst.emiPayAmount || 0).minus(emiPaidComponent).toNumber(),
        0
      );

      const fineAlreadyPaid = Number(inst.finePaid || 0);
      const storedFine = r2(inst.fineAmount || 0);
      const storedDelay = Number(inst.delayDays || 0);

      let daysLate = storedDelay;
      let fineAssessed = storedFine;
      let pct = 0;

      if (outstanding > 0) {
        const fineCalc = calculateFine(inst.paymentFor, outstanding);
        daysLate = Number(fineCalc.daysLate || 0);
        fineAssessed = r2(fineCalc.fineAmt);
        pct = fineCalc.pct || 0;
      }
      const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);

      const totalDue = r2(outstanding + fineDue);
      grandTotal = grandTotal.plus(totalDue);

      return {
        emiId: inst.id,
        paymentFor: inst.paymentFor,
        emiPayAmount: Number(inst.emiPayAmount),
        alreadyPaid: Number(inst.amountPaidSoFar),
        principalAmt: Number(inst.principalAmt),
        interestAmt: Number(inst.interestAmt),
        fineAssessed,
        finePaid: fineAlreadyPaid,
        fineDue,
        delayDays: daysLate,
        finePercentage: pct,
        totalDue,
      };
    });

    return res.json({
      data: { loanId, pending, grandTotal: grandTotal.toDecimalPlaces(2).toNumber() },
      status: 200,
    });
  } catch (err) {
    console.error("getPublicPendingPayments error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * GET /api/public/loan/:loanId/payments
 * Get payment history for a loan (unauthenticated)
 */
exports.getPublicPaymentHistory = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    if (!publicPortal.allowPaymentHistory) {
      return res.status(403).json({
        status: 403,
        error: "Payment history is not available in borrower self-service",
      });
    }

    const { page = 1, limit = 20 } = req.query;
    const loan = await resolveAccessiblePublicLoan(getResolvedPublicLoanId(req));
    const loanId = loan.id;

    const payments = await prisma.payment.findMany({
      where: {
        loanId,
        status: { in: ["PAID", "VERIFICATION_PENDING"] },
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      orderBy: { paymentDate: "desc" },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMode: true,
        transactionId: true,
        status: true,
        verified: true,
        verifiedAt: true,
        isForeclosure: true,
        metadata: true,
        emiId: true,
      },
    });

    const total = await prisma.payment.count({
      where: {
        loanId,
        status: { in: ["PAID", "VERIFICATION_PENDING"] },
      },
    });

    return res.json({
      status: 200,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      data: payments.map((payment) => ({
        ...payment,
        metadata: {
          summary: payment.metadata?.summary || null,
        },
      })),
    });
  } catch (err) {
    console.error("getPublicPaymentHistory error:", err);
    return res.status(err.statusCode || 500).json({ error: err.message, status: err.statusCode || 500 });
  }
};

/**
 * POST /api/public/loan/:loanId/payment
 * Make a payment (bulk pay) - unauthenticated
 * Supports ICICI payment gateway integration
 */
exports.makePublicPayment = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    if (!publicPortal.allowManualPaymentRequest) {
      return res.status(403).json({
        status: 403,
        error: "Manual payment request is disabled for borrower self-service",
      });
    }

    let {
      amountPaid,
      paymentMode,
      transactionId,
      paymentDate,
      // ICICI gateway specific fields
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
    } = req.body;

    amountPaid = r2(Number(amountPaid));
    if (!amountPaid || amountPaid <= 0) {
      return res.status(400).json({
        error: "amountPaid must be more than 0",
        status: 400
      });
    }

    const loan = await resolveAccessiblePublicLoan(getResolvedPublicLoanId(req), {
      loanType: {
        select: {
          rules: true,
        },
      },
    });
    const loanId = loan.id;

    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED"].includes(loan.fileStatus)) {
      return res.status(403).json({
        error: "Cannot make payment for this loan",
        status: 403
      });
    }

    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const result = await prisma.$transaction(
      async (tx) => {
        const today = new Date();

        // Update fines if stale (DB-based check, works across PM2 processes)
        if (await shouldUpdateLoanFines(tx, loanId)) {
          const toRefresh = await tx.eMI.findMany({
            where: {
              loanId,
              status: { in: ["UNPAID", "PARTIAL"] },
              paymentFor: { lte: today },
            },
            select: {
              id: true,
              paymentFor: true,
              emiPayAmount: true,
              amountPaidSoFar: true,
              finePaid: true,
              fineAmount: true,
              delayDays: true,
              isDelayed: true,
            },
          });

          const updates = toRefresh.map(async (e) => {
            const emiPaidComponent = new Decimal(e.amountPaidSoFar || 0)
              .minus(new Decimal(e.finePaid || 0))
              .toNumber();

            const emiDue = Math.max(
              new Decimal(e.emiPayAmount || 0).minus(emiPaidComponent).toNumber(),
              0
            );

            const storedFine = r2(e.fineAmount || 0);
            const storedDelay = Number(e.delayDays || 0);
            const storedIsDelayed = Boolean(e.isDelayed || storedDelay > 0);

            let newFine = storedFine;
            let newDelay = storedDelay;
            let isDelayed = storedIsDelayed;

            if (emiDue > 0) {
              const { daysLate, fineAmt } = calculateFine(
                e.paymentFor,
                emiDue
              );
              newFine = r2(fineAmt);
              newDelay = Number(daysLate || 0);
              isDelayed = newDelay > 0;
            }

            if (
              storedFine !== newFine ||
              storedDelay !== newDelay ||
              storedIsDelayed !== isDelayed
            ) {
              return tx.eMI.update({
                where: { id: e.id },
                data: { fineAmount: newFine, delayDays: newDelay, isDelayed },
              });
            }
            return null;
          });

          await Promise.all(updates);
          await markLoanFinesUpdated(tx, loanId);
        }

        // Fetch unpaid/partial EMIs
        const installments = await tx.eMI.findMany({
          where: { loanId, status: { in: ["UNPAID", "PARTIAL"] } },
          include: {
            loan: { include: { user: true, loanType: true, branch: true } },
          },
        });
        const repaymentPolicy = getRepaymentPolicy(loan.loanType?.rules);
        const eligibleInstallments = getSortedInstallments(
          installments.filter((emi) =>
            repaymentPolicy.allowAdvancePayment ? true : new Date(emi.paymentFor) <= today
          ),
          loan.loanType?.rules
        );

        // Public payments always need verification (no auto-verify)
        const verified = false;

        // Create payment record
        const payment = await tx.payment.create({
          data: {
            loanId,
            emiId: null,
            amount: amountPaid,
            paymentMode,
            transactionId: transactionId || gatewayPaymentId || null,
            paymentDate,
            status: "VERIFICATION_PENDING",
            verified: false,
            verifiedAt: null,
            verifiedByAdminId: null,
            verifiedByEmployeeId: null,
            adminId: null,
            employeeId: null,
            metadata: {
              note: "Public payment - distributed across multiple EMIs",
              affectedEmis: [],
              source: "public_api",
              gatewayOrderId: gatewayOrderId || null,
              gatewayPaymentId: gatewayPaymentId || null,
              gatewaySignature: gatewaySignature || null,
            },
          },
        });

        let remaining = r2(amountPaid);
        const updated = [];
        let totalUsed = 0;
        let totalFineCollected = 0;
        let totalInterestCollected = 0;
        let totalPrincipalCollected = 0;

        // Distribute payment across EMIs
        if (eligibleInstallments.length === 0) {
          throw Object.assign(
            new Error(
              repaymentPolicy.allowAdvancePayment
                ? "No pending installments found for this loan"
                : "Advance payment is disabled for this loan product and no due installment is available"
            ),
            { statusCode: 400 }
          );
        }

        for (const emi of eligibleInstallments) {
          if (remaining <= 0) break;

          const emiPaidComponent = Math.max(
            Number(emi.amountPaidSoFar || 0) - Number(emi.finePaid || 0),
            0
          );
          const emiDue = Math.max(
            Number(emi.emiPayAmount || 0) - emiPaidComponent,
            0
          );

          const storedFine = r2(emi.fineAmount || 0);
          const storedDelay = Number(emi.delayDays || 0);

          let fineAssessed = storedFine;
          let daysLate = storedDelay;

          if (emiDue > 0) {
            const fineCalc = calculateFine(emi.paymentFor, emiDue);
            fineAssessed = r2(fineCalc.fineAmt);
            daysLate = Number(fineCalc.daysLate || 0);
          }
          const fineAlreadyPaid = r2(emi.finePaid || 0);
          const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);
          const interestOutstanding = Math.max(
            Number(emi.interestAmt || 0) - Number(emi.interestPaid || 0),
            0
          );
          const principalOutstanding = Math.max(
            Number(emi.principalAmt || 0) - Number(emi.principalPaid || 0),
            0
          );
          const totalDueForEmi = r2(fineDue + interestOutstanding + principalOutstanding);

          if (emiDue <= 0 && fineDue <= 0) {
            if (
              emi.status !== "PAID" ||
              r2(emi.fineAmount || 0) !== fineAssessed ||
              Number(emi.delayDays || 0) !== Number(daysLate || 0)
            ) {
              await tx.eMI.update({
                where: { id: emi.id },
                data: {
                  status: "PAID",
                  fineAmount: fineAssessed,
                  delayDays: daysLate,
                  isDelayed: daysLate > 0,
                },
              });
            }
            continue;
          }

          const toPay = Math.min(remaining, totalDueForEmi);
          if (toPay <= 0) break;

          if (!repaymentPolicy.allowPartialPayment && toPay < totalDueForEmi) {
            throw Object.assign(
              new Error(
                "Partial payments are disabled for this loan product. Pay the full due amount for the installment."
              ),
              { statusCode: 400 }
            );
          }

          const allocation = distributeAcrossComponents({
            amount: toPay,
            balances: {
              FINE: fineDue,
              INTEREST: interestOutstanding,
              PRINCIPAL: principalOutstanding,
            },
            componentOrder: repaymentPolicy.componentAllocationOrder,
          });
          const payToFine = allocation.paid.FINE;
          const payInterest = allocation.paid.INTEREST;
          const payPrincipal = allocation.paid.PRINCIPAL;
          const payToEmi = r2(payInterest + payPrincipal);

          const newFinePaid = r2(fineAlreadyPaid + payToFine);
          const newInterestPaid = r2(
            Number(emi.interestPaid || 0) + payInterest
          );
          const newPrincipalPaid = r2(
            Number(emi.principalPaid || 0) + payPrincipal
          );

          const newAmountPaidSoFar = r2(
            Number(emi.amountPaidSoFar || 0) + payToFine + payToEmi
          );
          const newTotalPaid = r2(
            Number(emi.totalPaid || 0) + payToFine + payToEmi
          );

          const emiPaidComponentAfter = r2(
            newAmountPaidSoFar - newFinePaid
          );
          const emiDueAfter = r2(Math.max(
            Number(emi.emiPayAmount || 0) - emiPaidComponentAfter,
            0
          ));
          const fineDueAfter = r2(Math.max(fineAssessed - newFinePaid, 0));

          const newStatus =
            emiDueAfter <= 0.01 && fineDueAfter <= 0.01 ? "PAID" : "PARTIAL";

          // Update EMI (but mark as VERIFICATION_PENDING)
          await tx.eMI.update({
            where: { id: emi.id },
            data: {
              amountPaidSoFar: newAmountPaidSoFar,
              finePaid: newFinePaid,
              interestPaid: newInterestPaid,
              principalPaid: newPrincipalPaid,
              totalPaid: newTotalPaid,
              fineAmount: fineAssessed,
              delayDays: daysLate,
              isDelayed: daysLate > 0,
              verified: false,
              status: "VERIFICATION_PENDING",
              payments: { connect: { id: payment.id } },
            },
          });

          // Note: Loan totals will be updated ONLY after admin verification

          remaining = r2(remaining - (payToFine + payToEmi));
          totalUsed = r2(totalUsed + (payToFine + payToEmi));
          totalFineCollected = r2(totalFineCollected + payToFine);
          totalInterestCollected = r2(totalInterestCollected + payInterest);
          totalPrincipalCollected = r2(totalPrincipalCollected + payPrincipal);

          updated.push({
            emiId: emi.id,
            paymentFor: emi.paymentFor,
            paidAmount: r2(payToFine + payToEmi),
            paidToFine: payToFine,
            paidToEmi: payToEmi,
            paidToInterest: payInterest,
            paidToPrincipal: payPrincipal,
            emiStatus: "VERIFICATION_PENDING",
            daysLate,
            fineAssessed: fineAssessed,
            fineRemaining: r2(fineDueAfter),
            emiRemaining: r2(emiDueAfter),
          });
        }

        // Update payment metadata
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            metadata: {
              note: "Public payment - distributed across multiple EMIs",
              affectedEmis: updated,
              source: "public_api",
              gatewayOrderId: gatewayOrderId || null,
              gatewayPaymentId: gatewayPaymentId || null,
              gatewaySignature: gatewaySignature || null,
              summary: {
                totalAmount: amountPaid,
                usedAmount: totalUsed,
                unallocatedAmount: remaining,
                fineCollected: totalFineCollected,
                interestCollected: totalInterestCollected,
                principalCollected: totalPrincipalCollected,
                emisAffected: updated.length,
              },
            },
          },
        });

        return {
          message: "Payment submitted successfully. Awaiting admin verification.",
          paymentId: payment.id,
          usedAmount: totalUsed,
          unallocatedAmount: remaining,
          summary: {
            fineCollected: totalFineCollected,
            interestCollected: totalInterestCollected,
            principalCollected: totalPrincipalCollected,
          },
          updatedInstallments: updated,
          requiresVerification: true,
        };
      },
      { timeout: 30000 }
    );

    return res.status(200).json({ data: result, status: 200 });
  } catch (err) {
    console.error("makePublicPayment Error:", err);
    return res.status(err.statusCode || 500).json({
      error: err.message || "Payment failed",
      status: err.statusCode || 500
    });
  }
};

/**
 * POST /api/public/loan/:loanId/payment/emi/:emiId
 * Pay specific EMI (unauthenticated)
 */
exports.payPublicEmiById = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    if (!publicPortal.allowManualPaymentRequest) {
      return res.status(403).json({
        status: 403,
        error: "Manual payment request is disabled for borrower self-service",
      });
    }

    const { emiId } = req.params;
    let {
      amount,
      paymentMode,
      transactionId,
      paymentDate,
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
    } = req.body;

    amount = r2(Number(amount));
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "amount must be > 0", status: 400 });
    }

    paymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const emi = await prisma.eMI.findUnique({
      where: { id: emiId },
      include: {
        loan: {
          include: {
            loanType: {
              select: {
                rules: true,
              },
            },
          },
        },
      },
    });
    const loanId = getResolvedPublicLoanId(req);

    if (!emi || emi.loanId !== loanId) {
      return res.status(404).json({ error: "EMI not found", status: 404 });
    }

    // Verify loan is accessible
    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED"].includes(emi.loan.fileStatus)) {
      return res.status(403).json({
        error: "Cannot make payment for this loan",
        status: 403
      });
    }

    const emiPaidComponent = Math.max(
      Number(emi.amountPaidSoFar || 0) - Number(emi.finePaid || 0),
      0
    );
    const emiDue = Math.max(
      Number(emi.emiPayAmount || 0) - emiPaidComponent,
      0
    );

    let fineAssessed = r2(emi.fineAmount || 0);
    let daysLate = Number(emi.delayDays || 0);

    if (emiDue > 0) {
      const fineCalc = calculateFine(emi.paymentFor, emiDue);
      fineAssessed = r2(fineCalc.fineAmt);
      daysLate = Number(fineCalc.daysLate || 0);
    }
    const fineAlreadyPaid = r2(emi.finePaid || 0);
    const fineDue = Math.max(fineAssessed - fineAlreadyPaid, 0);
    const interestOutstanding = Math.max(
      Number(emi.interestAmt || 0) - Number(emi.interestPaid || 0),
      0
    );
    const principalOutstanding = Math.max(
      Number(emi.principalAmt || 0) - Number(emi.principalPaid || 0),
      0
    );
    const totalDueForEmi = r2(fineDue + interestOutstanding + principalOutstanding);
    const repaymentPolicy = getRepaymentPolicy(emi.loan?.loanType?.rules);

    if (!repaymentPolicy.allowAdvancePayment && new Date(emi.paymentFor) > paymentDate) {
      return res.status(400).json({
        error: "Advance payment is disabled for this loan product",
        status: 400,
      });
    }

    const allocatableAmount = Math.min(amount, totalDueForEmi);
    if (!repaymentPolicy.allowPartialPayment && allocatableAmount < totalDueForEmi) {
      return res.status(400).json({
        error: "Partial payments are disabled for this loan product. Pay the full due amount for the installment.",
        status: 400,
      });
    }

    const allocation = distributeAcrossComponents({
      amount: allocatableAmount,
      balances: {
        FINE: fineDue,
        INTEREST: interestOutstanding,
        PRINCIPAL: principalOutstanding,
      },
      componentOrder: repaymentPolicy.componentAllocationOrder,
    });
    const payToFine = allocation.paid.FINE;
    const payToInterest = allocation.paid.INTEREST;
    const payToPrincipal = allocation.paid.PRINCIPAL;

    const txResult = await prisma.$transaction(
      async (tx) => {
        // Create payment
        const payment = await tx.payment.create({
          data: {
            loanId,
            emiId,
            amount: r2(payToFine + payToInterest + payToPrincipal),
            paymentMode,
            transactionId: transactionId || gatewayPaymentId || null,
            paymentDate,
            status: "VERIFICATION_PENDING",
            verified: false,
            verifiedAt: null,
            metadata: {
              source: "public_api",
              gatewayOrderId: gatewayOrderId || null,
              gatewayPaymentId: gatewayPaymentId || null,
              gatewaySignature: gatewaySignature || null,
            },
          },
        });

        // Update EMI
        const newFinePaid = r2(fineAlreadyPaid + payToFine);
        const newInterestPaid = r2(
          Number(emi.interestPaid || 0) + payToInterest
        );
        const newPrincipalPaid = r2(
          Number(emi.principalPaid || 0) + payToPrincipal
        );
        const newAmountPaidSoFar = r2(
          Number(emi.amountPaidSoFar || 0) +
            payToFine +
            payToInterest +
            payToPrincipal
        );
        const newTotalPaid = r2(
          Number(emi.totalPaid || 0) +
            payToFine +
            payToInterest +
            payToPrincipal
        );

        const emiPaidComponentAfter = Math.max(
          newAmountPaidSoFar - newFinePaid,
          0
        );
        const emiDueAfter = Math.max(
          Number(emi.emiPayAmount || 0) - emiPaidComponentAfter,
          0
        );
        const fineDueAfter = Math.max(fineAssessed - newFinePaid, 0);
        const newStatus =
          emiDueAfter <= 0 && fineDueAfter <= 0 ? "PAID" : "PARTIAL";

        await tx.eMI.update({
          where: { id: emiId },
          data: {
            amountPaidSoFar: newAmountPaidSoFar,
            finePaid: newFinePaid,
            interestPaid: newInterestPaid,
            principalPaid: newPrincipalPaid,
            totalPaid: newTotalPaid,
            fineAmount: fineAssessed,
            delayDays: daysLate,
            isDelayed: daysLate > 0,
            status: "VERIFICATION_PENDING",
            payments: { connect: { id: payment.id } },
          },
        });

        return {
          paymentId: payment.id,
          newStatus: "VERIFICATION_PENDING",
        };
      },
      { timeout: 20000 }
    );

    return res.status(200).json({
      data: {
        message: "Payment submitted successfully. Awaiting admin verification.",
        paymentId: txResult.paymentId,
        paid: r2(payToFine + payToInterest + payToPrincipal),
        paidToFine: r2(payToFine),
        paidToInterest: r2(payToInterest),
        paidToPrincipal: r2(payToPrincipal),
        emiId,
        emiStatus: txResult.newStatus,
        requiresVerification: true,
      },
      status: 200,
    });
  } catch (err) {
    console.error("payPublicEmiById error:", err);
    return res.status(err.statusCode || 500).json({ error: err.message, status: err.statusCode || 500 });
  }
};

/**
 * GET /api/public/loan/:loanId/payment/:paymentId/receipt
 * Download payment receipt (unauthenticated)
 */
exports.getPublicPaymentReceipt = async (req, res) => {
  try {
    const { publicPortal, companyProfile, receiptPreferences } = await getPublicPortalConfig();
    if (!publicPortal.allowReceiptDownload) {
      return res.status(403).json({
        status: 403,
        error: "Receipt download is not available in borrower self-service",
      });
    }

    const { paymentId } = req.params;
    const loanId = getResolvedPublicLoanId(req);

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        loan: {
          include: {
            user: true,
            loanType: true,
            branch: true,
          },
        },
        emi: true,
      },
    });

    if (!payment || payment.loanId !== loanId) {
      return res.status(404).json({ error: "Payment not found", status: 404 });
    }

    // Only show verified/paid receipts
    if (payment.status !== "PAID") {
      return res.status(403).json({
        error: "Receipt not available yet. Payment pending verification.",
        status: 403
      });
    }

    const user = payment.loan.user;
    const loan = payment.loan;
    const emi = payment.emi;

    const receipt = {
      receiptNo: payment.id,
      receiptTitle: receiptPreferences.receiptTitle || "Loan Payment Receipt",
      paymentDate: payment.paymentDate,
      paymentMode: payment.paymentMode,
      amount: payment.amount,
      status: payment.status,
      transactionId: payment.transactionId,
      verified: payment.verified,
      verifiedAt: payment.verifiedAt,
      isForeclosure: payment.isForeclosure,
      metadata: payment.metadata,
      emiId: emi?.id || null,
      emiDueDate: emi?.paymentFor || null,
      emiAmount: emi?.emiPayAmount || null,
      principal: emi?.principalAmt || null,
      interest: emi?.interestAmt || null,
      user: {
        name: buildBorrowerName(user),
        phone: maskPhone(user.phone),
        email: maskEmail(user.email),
      },
      loan: {
        fileNo: loan.fileNo,
        loanType: loan.loanType?.name,
        branch: loan.branch?.name || "-",
        branchAddress: loan.branch?.address || "-",
        branchPhone: loan.branch?.phone || "-",
      },
      company: {
        companyName: companyProfile.companyName || "Finance Company",
        supportEmail: companyProfile.supportEmail || null,
        supportPhone: companyProfile.supportPhone || null,
        addressLine1: companyProfile.addressLine1 || null,
        addressLine2: companyProfile.addressLine2 || null,
        city: companyProfile.city || null,
        state: companyProfile.state || null,
        pincode: companyProfile.pincode || null,
        footerText: receiptPreferences.footerText || null,
      },
    };

    res.json({
      status: 200,
      data: receipt
    });
  } catch (err) {
    console.error("getPublicPaymentReceipt error:", err);
    res.status(err.statusCode || 500).json({ error: err.message, status: err.statusCode || 500 });
  }
};

/**
 * POST /api/public/loan/:loanId/payment/create-order
 * Create ICICI payment order (unauthenticated)
 */
exports.createPaymentGatewayOrder = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    if (!publicPortal.enabled) {
      return res.status(403).json({
        status: 403,
        error: "Borrower self-service portal is currently disabled",
      });
    }

    const { amount, paymentType, emiId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: "Invalid amount",
        status: 400
      });
    }

    const loan = await resolveAccessiblePublicLoan(getResolvedPublicLoanId(req), {
      user: {
        select: {
          firstName: true,
          middleName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    });

    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED", "SEIZED", "SEIZED_INITIATED"].includes(loan.fileStatus)) {
      return res.status(403).json({
        error: "Cannot make payment for this loan",
        status: 403
      });
    }

    // Generate unique order ID using actual loan.id
    const orderId = `LN_${loan.id.substring(0, 8)}_${Date.now()}`;

    const customerName = [
      loan.user.firstName,
      loan.user.middleName,
      loan.user.lastName,
    ]
      .filter(Boolean)
      .join(" ");

    const description = emiId
      ? `EMI Payment - Loan ${loan.fileNo}`
      : `Bulk Payment - Loan ${loan.fileNo}`;

    const qrResult = await gatewayGenerateQR({
      loanId: loan.id,
      emiId: emiId || null,
      amount: Number(amount),
      paymentType: paymentType || "BULK",
    });

    const orderResult = {
      orderId: qrResult.merchantTranId || orderId,
      paymentUrl: qrResult.qrString || qrResult.intentURL || "",
      paymentId: qrResult.transactionId || orderId,
      qrString: qrResult.qrString,
      gateway: qrResult.gateway,
      developmentMode: qrResult.developmentMode,
    };

    // Store pending order in database (optional - for tracking)
    await prisma.paymentOrder.create({
      data: {
        orderId: orderId,
        loanId: loan.id, // Use actual loan UUID, not the search parameter
        emiId: emiId || null,
        amount: Number(amount),
        paymentType: paymentType || "BULK",
        gatewayOrderId: orderResult.paymentId,
        status: "PENDING",
        metadata: {
          customerName,
          customerEmail: loan.user.email,
          customerPhone: loan.user.phone,
          description,
        },
      },
    }).catch((err) => {
      console.error("Failed to store payment order:", err);
      // Continue even if storage fails
    });

    return res.json({
      status: 200,
      data: {
        orderId: orderResult.orderId,
        paymentUrl: orderResult.paymentUrl,
        qrString: orderResult.qrString,
        gatewayOrderId: orderResult.paymentId,
        amount: Number(amount),
        gateway: orderResult.gateway,
        developmentMode: orderResult.developmentMode,
      },
    });
  } catch (err) {
    console.error("createPaymentGatewayOrder error:", err);
    return res.status(err.statusCode || 500).json({ error: err.message, status: err.statusCode || 500 });
  }
};

/**
 * POST /api/public/payment/callback
 * Handle payment gateway callback (Orange PG / PhiCommerce)
 */
exports.handlePaymentCallback = async (req, res) => {
  try {
    console.log("Payment callback received:", req.body);

    // Delegate to Orange PG handler — it verifies signature and auto-processes payment
    const { handleCallback } = require("./gateways/orangeGateway");
    await handleCallback(req.body).catch((err) => console.error("Orange PG callback error:", err));

    const orderId = req.body.orderId;
    if (!orderId) {
      return res.json({ status: 200, message: "Callback received" });
    }

    return res.json({ status: 200, message: "Callback processed" });
  } catch (err) {
    console.error("handlePaymentCallback error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * GET /api/public/payment/status/:orderId
 * Check payment status
 */
exports.checkPublicPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Check in database first
    const paymentOrder = await prisma.paymentOrder.findUnique({
      where: { orderId: orderId },
    });

    if (!paymentOrder) {
      return res.status(404).json({
        error: "Payment order not found",
        status: 404
      });
    }

    // If still pending, check with unified gateway
    if (paymentOrder.status === "PENDING") {
      const gatewayStatus = await gatewayCheckStatus(orderId).catch(() => null);
      if (gatewayStatus) {
        const mappedStatus = gatewayStatus.status === "SUCCESS" ? "COMPLETED"
          : gatewayStatus.status === "FAILURE" ? "FAILED"
          : "PENDING";
        await prisma.paymentOrder.update({
          where: { orderId },
          data: { status: mappedStatus, completedAt: mappedStatus !== "PENDING" ? new Date() : undefined },
        }).catch(() => {});

        return res.json({
          status: 200,
          data: { orderId, status: gatewayStatus.status, amount: gatewayStatus.localData?.amount, gateway: gatewayStatus.gateway },
        });
      }
    }

    return res.json({
      status: 200,
      data: {
        orderId: paymentOrder.orderId,
        status: paymentOrder.status,
        amount: paymentOrder.amount,
        loanId: paymentOrder.loanId,
        createdAt: paymentOrder.createdAt,
        completedAt: paymentOrder.completedAt,
      },
    });
  } catch (err) {
    console.error("checkPublicPaymentStatus error:", err);
    return res.status(500).json({ error: err.message, status: 500 });
  }
};

/**
 * POST /api/public/loan/:loanId/payment/generate-qr
 * Generate UPI QR code for public payment — routes through active gateway
 */
exports.generatePublicQR = async (req, res) => {
  try {
    const { publicPortal } = await getPublicPortalConfig();
    if (!publicPortal.enabled) {
      return res.status(403).json({ status: 403, error: "Borrower self-service portal is currently disabled" });
    }

    const { amount, paymentType } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required", status: 400 });
    }

    const loan = await resolveAccessiblePublicLoan(getResolvedPublicLoanId(req), {
      user: true,
      loanType: true,
    });

    if (!["ACTIVE", "OVERDUE", "DEFAULTED", "DISBURSED", "SEIZED", "SEIZED_INITIATED"].includes(loan.fileStatus)) {
      return res.status(403).json({ error: "Cannot make payment for this loan", status: 403 });
    }

    const { generateQR } = require("../utils/paymentGateway");
    const data = await generateQR({ loanId: loan.id, amount, paymentType, user: null });
    return res.status(200).json({ status: 200, data });
  } catch (error) {
    console.error("generatePublicQR error:", error);
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to generate QR code", status: error.statusCode || 500 });
  }
};

/**
 * GET /api/public/loan/:loanId/payment/upi-status/:merchantTranId
 * Check UPI transaction status — routes through active gateway
 */
exports.checkPublicUPIStatus = async (req, res) => {
  try {
    const { merchantTranId } = req.params;
    const { checkStatus } = require("../utils/paymentGateway");
    const data = await checkStatus(merchantTranId);
    return res.status(200).json({ status: 200, data });
  } catch (error) {
    console.error("checkPublicUPIStatus error:", error);
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to check transaction status", status: error.statusCode || 500 });
  }
};

// ─── Foreclosure Quote (self-service) ────────────────────────────────────────
exports.getForeclosureQuote = async (req, res) => {
  try {
    const { loanId } = req.params;

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        emi: {
          where: { isPaid: false },
          orderBy: { dueDate: "asc" },
        },
        loanType: { select: { rules: true } },
      },
    });

    if (!loan) return res.status(404).json({ error: "Loan not found" });
    if (loan.isClosed) return res.status(400).json({ error: "Loan is already closed" });

    const today = new Date();
    const unpaidEmis = loan.emi || [];

    // Sum outstanding principal, interest, fine
    let outstandingPrincipal = 0;
    let outstandingInterest = 0;
    let outstandingFine = 0;
    let totalPaidPrincipal = 0;

    for (const e of unpaidEmis) {
      outstandingPrincipal += Number(e.principalAmount || 0);
      outstandingInterest += Number(e.interestAmount || 0);
      outstandingFine += Number(e.fineAmount || 0);
    }

    totalPaidPrincipal = Number(loan.totalPaidPrincipal || 0);

    // Foreclosure charge from loanType rules
    const rules = loan.loanType?.rules || {};
    const foreclosureFeePercent = rules?.fees?.foreclosureFee?.value || 0;
    const foreclosureCharge = Math.round(outstandingPrincipal * (foreclosureFeePercent / 100));

    const totalForeclosureAmount = Math.round(
      outstandingPrincipal + outstandingInterest + outstandingFine + foreclosureCharge
    );

    const quoteValidTill = new Date(today);
    quoteValidTill.setDate(quoteValidTill.getDate() + 7); // valid for 7 days

    res.json({
      data: {
        loanId,
        fileNo: loan.fileNo,
        quoteDate: today.toISOString(),
        quoteValidTill: quoteValidTill.toISOString(),
        outstandingPrincipal,
        outstandingInterest,
        outstandingFine,
        foreclosureCharge,
        foreclosureFeePercent,
        totalForeclosureAmount,
        remainingEmis: unpaidEmis.length,
        note: "This is an indicative quote. Actual amount may vary based on payment date.",
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate foreclosure quote", message: err.message });
  }
};
