const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Collection Bucket Config ─────────────────────────────────────────────────

exports.createBucket = async (req, res) => {
  try {
    const { name, label, minDpd, maxDpd, priority, contactMethodOrder, escalationSlaHours, maxAttemptsBeforeEscalate, autoEscalate, legalEligible, settlementEligible } = req.body;
    const bucket = await prisma.collectionBucketConfig.create({
      data: { name, label, minDpd, maxDpd, priority: priority ?? "MEDIUM", contactMethodOrder: contactMethodOrder ?? [], escalationSlaHours: escalationSlaHours ?? 72, maxAttemptsBeforeEscalate: maxAttemptsBeforeEscalate ?? 3, autoEscalate: autoEscalate ?? true, legalEligible: legalEligible ?? false, settlementEligible: settlementEligible ?? false },
    });
    res.status(201).json({ message: "Collection bucket created", data: bucket });
  } catch (err) {
    if (err.code === "P2002") return res.status(400).json({ error: "Bucket name already exists" });
    res.status(500).json({ error: "Failed to create collection bucket", message: err.message });
  }
};

exports.listBuckets = async (req, res) => {
  try {
    const buckets = await prisma.collectionBucketConfig.findMany({ where: { isActive: true }, orderBy: { minDpd: "asc" } });
    res.json({ data: buckets });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch collection buckets" });
  }
};

exports.updateBucket = async (req, res) => {
  try {
    const bucket = await prisma.collectionBucketConfig.update({ where: { id: req.params.id }, data: req.body });
    res.json({ message: "Updated", data: bucket });
  } catch (err) {
    res.status(500).json({ error: "Failed to update collection bucket", message: err.message });
  }
};

// Resolve which bucket a DPD falls into
exports.resolveBucket = async (req, res) => {
  try {
    const dpd = parseInt(req.query.dpd, 10);
    if (isNaN(dpd)) return res.status(400).json({ error: "dpd query param required" });
    const buckets = await prisma.collectionBucketConfig.findMany({ where: { isActive: true }, orderBy: { minDpd: "asc" } });
    const matched = buckets.find((b) => dpd >= b.minDpd && (b.maxDpd === null || dpd <= b.maxDpd));
    res.json({ data: matched || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve bucket" });
  }
};

// ─── Promise to Pay ───────────────────────────────────────────────────────────

exports.createPTP = async (req, res) => {
  try {
    const { caseId, loanId, promiseDate, promiseAmount, followUpDate, notes } = req.body;
    const ptp = await prisma.promiseToPay.create({
      data: { caseId, loanId, promiseDate: new Date(promiseDate), promiseAmount, followUpDate: followUpDate ? new Date(followUpDate) : null, notes, createdByAdminId: req.user.adminId, createdByEmployeeId: req.user.employeeId },
    });
    // Update case status
    await prisma.collectionCase.update({ where: { id: caseId }, data: { status: "PROMISE_TO_PAY", latestPromiseDate: new Date(promiseDate), latestPromiseAmount: promiseAmount } });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "PROMISE TO PAY CREATED", table: "PromiseToPay", targetId: ptp.id, metadata: { caseId, promiseDate, promiseAmount } });
    res.status(201).json({ message: "Promise to pay recorded", data: ptp });
  } catch (err) {
    res.status(500).json({ error: "Failed to create promise to pay", message: err.message });
  }
};

exports.fulfillPTP = async (req, res) => {
  try {
    const ptp = await prisma.promiseToPay.update({
      where: { id: req.params.id },
      data: { isFulfilled: true, fulfilledAt: new Date() },
    });
    await prisma.collectionCase.update({ where: { id: ptp.caseId }, data: { status: "RESOLVED" } });
    res.json({ message: "PTP marked fulfilled", data: ptp });
  } catch (err) {
    res.status(500).json({ error: "Failed to fulfil PTP", message: err.message });
  }
};

exports.breakPTP = async (req, res) => {
  try {
    const ptp = await prisma.promiseToPay.update({
      where: { id: req.params.id },
      data: { isBroken: true, brokenAt: new Date() },
    });
    await prisma.collectionCase.update({ where: { id: ptp.caseId }, data: { status: "BROKEN_PROMISE" } });
    res.json({ message: "PTP marked broken", data: ptp });
  } catch (err) {
    res.status(500).json({ error: "Failed to break PTP", message: err.message });
  }
};

exports.listPTPs = async (req, res) => {
  try {
    const { caseId, loanId, isFulfilled, isBroken } = req.query;
    const where = {};
    if (caseId) where.caseId = caseId;
    if (loanId) where.loanId = loanId;
    if (isFulfilled !== undefined) where.isFulfilled = isFulfilled === "true";
    if (isBroken !== undefined) where.isBroken = isBroken === "true";
    const ptps = await prisma.promiseToPay.findMany({ where, orderBy: { promiseDate: "asc" } });
    res.json({ data: ptps });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch PTPs" });
  }
};

// ─── Legal Actions ────────────────────────────────────────────────────────────

exports.createLegalAction = async (req, res) => {
  try {
    const { loanId, caseId, stage, noticeDate, filingDate, caseNumber, court, decreeDate, decreeAmount, nextHearingDate, notes, lawyerName, lawyerContact, fileId } = req.body;
    const action = await prisma.legalAction.create({
      data: { loanId, caseId, stage: stage ?? "NOTICE_SENT", noticeDate: noticeDate ? new Date(noticeDate) : null, filingDate: filingDate ? new Date(filingDate) : null, caseNumber, court, decreeDate: decreeDate ? new Date(decreeDate) : null, decreeAmount, nextHearingDate: nextHearingDate ? new Date(nextHearingDate) : null, notes, lawyerName, lawyerContact, fileId, createdByAdminId: req.user.adminId, createdByEmployeeId: req.user.employeeId },
    });
    if (caseId) await prisma.collectionCase.update({ where: { id: caseId }, data: { status: "IN_PROGRESS" } });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `LEGAL ACTION: ${stage}`, table: "LegalAction", targetId: action.id, metadata: { loanId } });
    res.status(201).json({ message: "Legal action recorded", data: action });
  } catch (err) {
    res.status(500).json({ error: "Failed to create legal action", message: err.message });
  }
};

exports.updateLegalAction = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.noticeDate) data.noticeDate = new Date(data.noticeDate);
    if (data.filingDate) data.filingDate = new Date(data.filingDate);
    if (data.decreeDate) data.decreeDate = new Date(data.decreeDate);
    if (data.nextHearingDate) data.nextHearingDate = new Date(data.nextHearingDate);
    const action = await prisma.legalAction.update({ where: { id: req.params.id }, data });
    res.json({ message: "Legal action updated", data: action });
  } catch (err) {
    res.status(500).json({ error: "Failed to update legal action", message: err.message });
  }
};

exports.listLegalActions = async (req, res) => {
  try {
    const { loanId, caseId, stage } = req.query;
    const where = {};
    if (loanId) where.loanId = loanId;
    if (caseId) where.caseId = caseId;
    if (stage) where.stage = stage;
    const actions = await prisma.legalAction.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: actions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch legal actions" });
  }
};
