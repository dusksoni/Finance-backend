// controllers/cibil.controller.js
// Credit bureau integration — supports multiple providers via AppConfig
//
// Providers:
//   "transunion"  — Direct TransUnion CIBIL XML API (requires NBFC membership)
//   "surepass"    — Surepass aggregator REST API (sandbox-testable, no membership needed)
//   "mock"        — Returns deterministic fake scores for local dev

const prisma = require("../lib/prisma");
const axios = require("axios");
const logAction = require("../utils/adminLogger");
const { buildEffectiveConfigMap } = require("../utils/appConfig");

async function getCibilConfig() {
  const records = await prisma.appConfig.findMany({ where: { key: "nbfc.cibil" } });
  const map = buildEffectiveConfigMap(records);
  return map["nbfc.cibil"] || {};
}

// ─── Pull credit score for a user ────────────────────────────────────────────
exports.pullCibilScore = async (req, res) => {
  try {
    const { userId } = req.params;
    const config = await getCibilConfig();

    if (!config.enabled) {
      return res.status(400).json({
        error: "Credit bureau integration is not enabled. Configure it in NBFC Settings → Credit & CIBIL.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, middleName: true, phone: true, pan: true, dateOfBirth: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.pan) {
      return res.status(400).json({ error: "User does not have a PAN number. PAN is required for credit enquiry." });
    }

    const provider = config.provider || "surepass";
    let result;

    if (provider === "mock") {
      result = await fetchMockScore(user, config);
    } else if (provider === "surepass") {
      result = await fetchSurepassScore(user, config);
    } else if (provider === "transunion") {
      result = await fetchTransunionScore(user, config);
    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    const { score, reportNumber, enquiryStatus, errorMessage, rawData } = result;

    const eligibility = score !== null
      ? score >= (config.marginalScore || 700)
        ? "ELIGIBLE"
        : score >= (config.minAcceptableScore || 650)
        ? "MARGINAL"
        : "INELIGIBLE"
      : "UNKNOWN";

    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "CIBIL ENQUIRY",
      table: "User",
      targetId: userId,
      metadata: { score, reportNumber, eligibility, enquiryStatus, errorMessage, pan: user.pan, provider },
    });

    // Record metric if metrics module is loaded
    try {
      const { recordCibilEnquiry } = require("../middleware/metrics");
      recordCibilEnquiry({ provider, status: enquiryStatus === "SUCCESS" ? "success" : "failed" });
    } catch (_) {}

    res.json({
      data: {
        userId, pan: user.pan, score, reportNumber, eligibility,
        minAcceptableScore: config.minAcceptableScore || 650,
        marginalScore: config.marginalScore || 700,
        enquiryStatus, errorMessage, provider, pulledAt: new Date(),
        ...(rawData && process.env.NODE_ENV !== "production" ? { rawData } : {}),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to pull credit score", message: err.message });
  }
};

// ─── History ──────────────────────────────────────────────────────────────────
exports.getCibilHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const logs = await prisma.actionLog.findMany({
      where: { action: "CIBIL ENQUIRY", targetId: userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ data: logs.map((l) => ({ ...l.metadata, loggedAt: l.createdAt })) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch CIBIL history", message: err.message });
  }
};

// ─── Eligibility check (no API call — just score threshold check) ──────────
exports.checkEligibility = async (req, res) => {
  try {
    const { score } = req.body;
    const config = await getCibilConfig();
    if (!config.enabled) return res.json({ data: { eligibility: "NOT_CONFIGURED" } });

    const numScore = Number(score);
    const marginalScore = config.marginalScore || 700;
    const minAcceptableScore = config.minAcceptableScore || 650;
    const eligibility = numScore >= marginalScore ? "ELIGIBLE" : numScore >= minAcceptableScore ? "MARGINAL" : "INELIGIBLE";

    res.json({ data: { score: numScore, eligibility, minAcceptableScore, marginalScore } });
  } catch (err) {
    res.status(500).json({ error: "Failed to check eligibility", message: err.message });
  }
};

// ─── Provider: Surepass ───────────────────────────────────────────────────────
// Surepass CIBIL API — contact Surepass to get API credentials
// Request: POST https://kyc-api.surepass.io/api/v1/credit-report/cibil
// Headers: Authorization: Bearer <token>
// Body: { id_number: "PAN", dob: "DD-MM-YYYY", name: "FULL NAME", phone: "10digit" }
async function fetchSurepassScore(user, config) {
  const token = config.surepassToken || process.env.SUREPASS_API_TOKEN;
  const apiUrl = config.surepassApiUrl || "https://kyc-api.surepass.io/api/v1/credit-report/cibil";

  if (!token) {
    return {
      score: null, reportNumber: null,
      enquiryStatus: "FAILED",
      errorMessage: "Surepass API token not configured. Set surepassToken in NBFC Settings → Credit & CIBIL, or SUREPASS_API_TOKEN in env.",
    };
  }

  const dob = user.dateOfBirth
    ? new Date(user.dateOfBirth).toLocaleDateString("en-GB").replace(/\//g, "-")
    : "";

  const fullName = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ");

  try {
    const response = await axios.post(
      apiUrl,
      {
        id_number: user.pan,
        dob,
        name: fullName,
        phone: user.phone?.replace(/\D/g, "").slice(-10),
      },
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    const body = response.data;
    // Surepass response: { success: true, data: { credit_score: 750, report_number: "...", ... } }
    if (!body.success) {
      return { score: null, reportNumber: null, enquiryStatus: "FAILED", errorMessage: body.message || "Surepass API error" };
    }

    const score = body.data?.credit_score ?? body.data?.cibil_score ?? null;
    const reportNumber = body.data?.report_number ?? body.data?.control_number ?? null;

    return { score: score !== null ? Number(score) : null, reportNumber, enquiryStatus: "SUCCESS", rawData: body.data };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    return { score: null, reportNumber: null, enquiryStatus: "FAILED", errorMessage: msg };
  }
}

// ─── Provider: TransUnion CIBIL (direct) ─────────────────────────────────────
// Requires NBFC membership + CIBIL-issued memberId + password
async function fetchTransunionScore(user, config) {
  if (!config.memberId || !config.password || !config.apiUrl) {
    return {
      score: null, reportNumber: null, enquiryStatus: "FAILED",
      errorMessage: "TransUnion credentials not configured (memberId, password, apiUrl required).",
    };
  }

  const dob = user.dateOfBirth
    ? new Date(user.dateOfBirth).toISOString().split("T")[0].replace(/-/g, "")
    : "";

  const requestXml = buildTransunionXml({ config, user, dob });

  try {
    const response = await axios.post(config.apiUrl, requestXml, {
      headers: { "Content-Type": "application/xml", Accept: "application/xml" },
      timeout: 30000,
    });
    const parsed = parseTransunionResponse(response.data);
    return { ...parsed, enquiryStatus: parsed.score !== null ? "SUCCESS" : "FAILED", rawData: response.data };
  } catch (err) {
    return { score: null, reportNumber: null, enquiryStatus: "FAILED", errorMessage: err.message };
  }
}

// ─── Provider: Mock (dev/test) ────────────────────────────────────────────────
// Returns a deterministic score based on PAN so results are stable across calls
async function fetchMockScore(user, config) {
  // Deterministic: sum of PAN char codes mod 601 + 300 → always 300-900
  const seed = user.pan.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const score = 300 + (seed % 601);
  return {
    score,
    reportNumber: `MOCK-${user.pan}-${Date.now()}`,
    enquiryStatus: "SUCCESS",
    rawData: { note: "Mock score — dev mode only", pan: user.pan },
  };
}

// ─── TransUnion XML helpers ───────────────────────────────────────────────────
function buildTransunionXml({ config, user, dob }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<INProfileRequest>
  <Applicant>
    <InquiryPurpose>05</InquiryPurpose>
    <Segment type="APPLICANT-DEMOGRAPHICS">
      <Value field="APPLICANT-NAME">${user.firstName} ${user.lastName || ""}</Value>
      <Value field="DOB">${dob}</Value>
    </Segment>
    <Segment type="ID-SEGMENT">
      <Value field="PANID">${user.pan}</Value>
    </Segment>
    <Segment type="PHONES">
      <Value field="MOBILE-TELEPHONE-NUMBER">${user.phone?.replace(/\D/g, "")}</Value>
    </Segment>
  </Applicant>
  <InquiryMember>
    <MemberId>${config.memberId}</MemberId>
    <Password>${config.password}</Password>
    <MemberReferenceNumber>REF-${user.id.slice(-8).toUpperCase()}</MemberReferenceNumber>
  </InquiryMember>
</INProfileRequest>`;
}

function parseTransunionResponse(xml) {
  const scoreMatch =
    xml.match(/<Score[^>]*>(\d+)<\/Score>/i) ||
    xml.match(/field="CIBIL-SCORE">(\d+)<\/Value>/i) ||
    xml.match(/<BureauScore>(\d+)<\/BureauScore>/i);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;

  const reportMatch =
    xml.match(/<ReportNumber[^>]*>([^<]+)<\/ReportNumber>/i) ||
    xml.match(/<ControlNumber>([^<]+)<\/ControlNumber>/i);
  const reportNumber = reportMatch ? reportMatch[1] : null;

  return { score, reportNumber };
}
