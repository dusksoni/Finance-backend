const prisma = require("../lib/prisma");
const { buildEffectiveConfigMap } = require("../utils/appConfig");
const {
  resolvePublicAccessToken,
  hashPublicAccessToken,
  buildPublicLoanLookupWhere,
  normalizeIdentifier,
} = require("../utils/publicAccess");

const shouldRequirePublicAccess = async () => {
  const envOverride = process.env.PUBLIC_PAYMENT_REQUIRE_ACCESS_TOKEN;
  if (envOverride !== undefined) {
    return String(envOverride).toLowerCase() === "true";
  }

  const records = await prisma.appConfig.findMany({
    where: {
      key: {
        in: ["security.public_access"],
      },
    },
  });

  const configs = buildEffectiveConfigMap(records);
  return Boolean(configs["security.public_access"]?.requireAccessToken);
};

const requirePublicAccess = async (req, res, next) => {
  const token = resolvePublicAccessToken(req);

  try {
    const requireAccessToken = await shouldRequirePublicAccess();
    const requestedIdentifier = req.params.loanId
      ? normalizeIdentifier(req.params.loanId)
      : null;

    let resolvedLoan = null;
    if (requestedIdentifier) {
      resolvedLoan = await prisma.loan.findFirst({
        where: buildPublicLoanLookupWhere(requestedIdentifier),
        select: {
          id: true,
          fileNo: true,
        },
      });

      if (resolvedLoan) {
        req.publicLoanId = resolvedLoan.id;
        req.publicLoanIdentifier = requestedIdentifier;
      }
    }

    if (!requireAccessToken) {
      return next();
    }

    if (!token) {
      return res.status(401).json({
        status: 401,
        error: "Public access token missing",
      });
    }

    const session = await prisma.publicAccessSession.findUnique({
      where: {
        accessTokenHash: hashPublicAccessToken(token),
      },
      include: {
        loan: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(401).json({
        status: 401,
        error: "Invalid public access token",
      });
    }

    if (session.status !== "ACTIVE") {
      return res.status(403).json({
        status: 403,
        error: "Public access token is not active",
      });
    }

    if (session.expiresAt <= new Date()) {
      return res.status(401).json({
        status: 401,
        error: "Public access token expired",
      });
    }

    if (requestedIdentifier && !resolvedLoan) {
      return res.status(404).json({
        status: 404,
        error: "Loan not found",
      });
    }

    if (resolvedLoan && session.loanId !== resolvedLoan.id) {
      return res.status(403).json({
        status: 403,
        error: "Public access token does not match the requested loan",
      });
    }

    req.publicAccessSession = session;
    req.publicLoanId = session.loanId;

    await prisma.publicAccessSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return next();
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to validate public access token",
      message: error.message,
    });
  }
};

module.exports = {
  requirePublicAccess,
  shouldRequirePublicAccess,
};
