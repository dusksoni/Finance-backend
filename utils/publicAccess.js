const crypto = require("crypto");

const ACCESS_TOKEN_HEADER = "x-public-access-token";

const normalizeIdentifier = (value) => String(value || "").trim();

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const hashPublicAccessToken = (token) => {
  const secret = process.env.PUBLIC_ACCESS_SECRET || process.env.SECRET_KEY || "public-access-secret";
  return crypto.createHmac("sha256", secret).update(String(token)).digest("hex");
};

const createRawPublicAccessToken = () => crypto.randomBytes(24).toString("base64url");

const getTokenTtlMinutes = (configValue) => {
  const parsed = Number(configValue);
  if (Number.isFinite(parsed) && parsed >= 5) return parsed;
  return 30;
};

const buildPublicLoanLookupWhere = (identifier) => ({
  OR: [
    { id: identifier },
    { fileNo: identifier },
    {
      twoWheelerLoan: {
        registrationNumber: {
          equals: identifier,
          mode: "insensitive",
        },
      },
    },
    {
      agriLoan: {
        registrationNumber: {
          equals: identifier,
          mode: "insensitive",
        },
      },
    },
    {
      msmeLoan: {
        registrationNumber: {
          equals: identifier,
          mode: "insensitive",
        },
      },
    },
  ],
});

const matchesBorrowerVerification = (loan, { phone, dateOfBirth }) => {
  if (!loan?.user) return false;

  const normalizedInputPhone = normalizePhone(phone);
  const normalizedStoredPhone = normalizePhone(loan.user.phone);
  const phoneMatches =
    Boolean(normalizedInputPhone) &&
    Boolean(normalizedStoredPhone) &&
    (
      normalizedStoredPhone === normalizedInputPhone ||
      normalizedStoredPhone.endsWith(normalizedInputPhone) ||
      normalizedInputPhone.endsWith(normalizedStoredPhone)
    );

  const dobMatches =
    Boolean(dateOfBirth) &&
    loan.user.dateOfBirth instanceof Date &&
    loan.user.dateOfBirth.toISOString().slice(0, 10) === String(dateOfBirth).slice(0, 10);

  return phoneMatches || dobMatches;
};

const resolvePublicAccessToken = (req) =>
  req.headers[ACCESS_TOKEN_HEADER] ||
  req.query.accessToken ||
  req.body?.accessToken ||
  null;

module.exports = {
  ACCESS_TOKEN_HEADER,
  buildPublicLoanLookupWhere,
  createRawPublicAccessToken,
  getTokenTtlMinutes,
  hashPublicAccessToken,
  matchesBorrowerVerification,
  normalizeIdentifier,
  normalizePhone,
  resolvePublicAccessToken,
};
