// controllers/cibil.controller.js
// TransUnion CIBIL API integration — credentials stored in AppConfig (nbfc.cibil)

const prisma = require("../lib/prisma");
const axios = require("axios");
const logAction = require("../utils/adminLogger");
const { buildEffectiveConfigMap } = require("../utils/appConfig");

async function getCibilConfig() {
  const records = await prisma.appConfig.findMany({ where: { key: "nbfc.cibil" } });
  const map = buildEffectiveConfigMap(records);
  return map["nbfc.cibil"] || {};
}

// ─── Pull CIBIL score for a user ─────────────────────────────────────────────
// Stores result in CIBILReport model (falls back to ActionLog if model not present)
exports.pullCibilScore = async (req, res) => {
  try {
    const { userId } = req.params;
    const config = await getCibilConfig();

    if (!config.enabled) {
      return res.status(400).json({ error: "CIBIL integration is not enabled. Configure it in NBFC Settings → Credit & CIBIL." });
    }
    if (!config.memberId || !config.password || !config.apiUrl) {
      return res.status(400).json({ error: "CIBIL API credentials not configured. Set them in NBFC Settings → Credit & CIBIL." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, phone: true, pan: true, dateOfBirth: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.pan) {
      return res.status(400).json({ error: "User does not have a PAN number. PAN is required for CIBIL enquiry." });
    }

    // Build TransUnion CIBIL XML request (standard format)
    const dob = user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split("T")[0].replace(/-/g, "") : "";
    const requestXml = buildCibilRequestXml({ config, user, dob });

    let score = null;
    let rawResponse = null;
    let reportNumber = null;
    let enquiryStatus = "SUCCESS";
    let errorMessage = null;

    try {
      const response = await axios.post(config.apiUrl, requestXml, {
        headers: { "Content-Type": "application/xml", "Accept": "application/xml" },
        timeout: 30000,
      });
      rawResponse = response.data;
      const parsed = parseCibilResponse(rawResponse);
      score = parsed.score;
      reportNumber = parsed.reportNumber;
    } catch (apiErr) {
      enquiryStatus = "FAILED";
      errorMessage = apiErr.message;
      // Still log the failed attempt
    }

    // Determine eligibility
    const eligibility = score !== null
      ? score >= config.minAcceptableScore
        ? score >= config.marginalScore ? "ELIGIBLE" : "MARGINAL"
        : "INELIGIBLE"
      : "UNKNOWN";

    // Log to ActionLog (until dedicated CIBILReport model is added)
    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "CIBIL ENQUIRY",
      table: "User",
      targetId: userId,
      metadata: {
        score,
        reportNumber,
        eligibility,
        enquiryStatus,
        errorMessage,
        pan: user.pan,
        provider: config.provider,
      },
    });

    res.json({
      data: {
        userId,
        pan: user.pan,
        score,
        reportNumber,
        eligibility,
        minAcceptableScore: config.minAcceptableScore,
        marginalScore: config.marginalScore,
        enquiryStatus,
        errorMessage,
        provider: config.provider,
        pulledAt: new Date(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to pull CIBIL score", message: err.message });
  }
};

// ─── Get CIBIL history for a user (from action logs) ─────────────────────────
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

// ─── Check CIBIL eligibility (without storing — for quick appraisal) ─────────
exports.checkEligibility = async (req, res) => {
  try {
    const { score } = req.body;
    const config = await getCibilConfig();
    if (!config.enabled) return res.json({ data: { eligibility: "NOT_CONFIGURED" } });

    const numScore = Number(score);
    const eligibility = numScore >= config.marginalScore
      ? "ELIGIBLE"
      : numScore >= config.minAcceptableScore
      ? "MARGINAL"
      : "INELIGIBLE";

    res.json({
      data: {
        score: numScore,
        eligibility,
        minAcceptableScore: config.minAcceptableScore,
        marginalScore: config.marginalScore,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to check eligibility", message: err.message });
  }
};

// ─── XML builder for TransUnion CIBIL ────────────────────────────────────────
function buildCibilRequestXml({ config, user, dob }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<INProfileRequest>
  <Applicant>
    <InquiryPurpose>05</InquiryPurpose>
    <Segment type="APPLICANT-DEMOGRAPHICS">
      <Value field="APPLICANT-NAME">${user.firstName} ${user.lastName}</Value>
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

// ─── Basic XML response parser ────────────────────────────────────────────────
function parseCibilResponse(xml) {
  // Extract score — TransUnion CIBIL returns score in <Score> or <Value field="CIBIL-SCORE">
  const scoreMatch = xml.match(/<Score[^>]*>(\d+)<\/Score>/i) ||
    xml.match(/field="CIBIL-SCORE">(\d+)<\/Value>/i) ||
    xml.match(/<BureauScore>(\d+)<\/BureauScore>/i);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;

  const reportMatch = xml.match(/<ReportNumber[^>]*>([^<]+)<\/ReportNumber>/i) ||
    xml.match(/<ControlNumber>([^<]+)<\/ControlNumber>/i);
  const reportNumber = reportMatch ? reportMatch[1] : null;

  return { score, reportNumber };
}
