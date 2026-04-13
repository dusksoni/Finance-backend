const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Day-End Closing ──────────────────────────────────────────────────────────

exports.getDayEnd = async (req, res) => {
  try {
    const { branchId, date } = req.query;
    if (!branchId || !date) return res.status(400).json({ error: "branchId and date required" });
    const dayEnd = await prisma.dayEndClosing.findUnique({ where: { branchId_date: { branchId, date: new Date(date) } } });
    res.json({ data: dayEnd || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch day-end", message: err.message });
  }
};

exports.upsertDayEnd = async (req, res) => {
  try {
    const { branchId, date, openingCash, expectedCash, declaredCash, totalCollections, totalOnline, notes } = req.body;
    const parsedDate = new Date(date);
    const variance = Number(declaredCash ?? 0) - Number(expectedCash ?? 0);
    const dayEnd = await prisma.dayEndClosing.upsert({
      where: { branchId_date: { branchId, date: parsedDate } },
      update: { openingCash, expectedCash, declaredCash, variance, totalCollections, totalOnline, notes },
      create: { branchId, date: parsedDate, openingCash: openingCash ?? 0, expectedCash: expectedCash ?? 0, declaredCash: declaredCash ?? 0, variance, totalCollections: totalCollections ?? 0, totalOnline: totalOnline ?? 0, notes },
    });
    res.json({ message: "Day-end saved", data: dayEnd });
  } catch (err) {
    res.status(500).json({ error: "Failed to save day-end", message: err.message });
  }
};

exports.submitDayEnd = async (req, res) => {
  try {
    const dayEnd = await prisma.dayEndClosing.findUnique({ where: { id: req.params.id } });
    if (!dayEnd) return res.status(404).json({ error: "Day-end record not found" });
    if (dayEnd.status !== "OPEN") return res.status(400).json({ error: "Day-end already submitted" });
    const updated = await prisma.dayEndClosing.update({
      where: { id: req.params.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), submittedByAdminId: req.user.adminId, submittedByEmployeeId: req.user.employeeId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "DAY-END SUBMITTED", table: "DayEndClosing", targetId: dayEnd.id });
    res.json({ message: "Day-end submitted for approval", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit day-end", message: err.message });
  }
};

exports.approveDayEnd = async (req, res) => {
  try {
    const updated = await prisma.dayEndClosing.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedByAdminId: req.user.adminId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "DAY-END APPROVED", table: "DayEndClosing", targetId: req.params.id });
    res.json({ message: "Day-end approved", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve day-end", message: err.message });
  }
};

exports.rejectDayEnd = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const updated = await prisma.dayEndClosing.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", rejectionReason },
    });
    res.json({ message: "Day-end rejected", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject day-end", message: err.message });
  }
};

exports.listDayEnds = async (req, res) => {
  try {
    const { branchId, status, fromDate, toDate } = req.query;
    const where = {};
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;
    if (fromDate || toDate) where.date = {};
    if (fromDate) where.date.gte = new Date(fromDate);
    if (toDate) where.date.lte = new Date(toDate);
    const dayEnds = await prisma.dayEndClosing.findMany({ where, orderBy: { date: "desc" }, take: 200 });
    res.json({ data: dayEnds });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch day-ends" });
  }
};

// ─── Bank Reconciliation ──────────────────────────────────────────────────────

exports.createBankRecon = async (req, res) => {
  try {
    const { branchId, statementDate, bankAccountNumber, bankName, statementAmount, systemAmount, notes } = req.body;
    const variance = Number(systemAmount ?? 0) - Number(statementAmount ?? 0);
    const recon = await prisma.bankReconciliation.create({
      data: { branchId, statementDate: new Date(statementDate), bankAccountNumber, bankName, statementAmount, systemAmount, variance, notes },
    });
    res.status(201).json({ message: "Bank reconciliation created", data: recon });
  } catch (err) {
    res.status(500).json({ error: "Failed to create bank reconciliation", message: err.message });
  }
};

exports.markBankReconReconciled = async (req, res) => {
  try {
    const { notes } = req.body;
    const recon = await prisma.bankReconciliation.update({
      where: { id: req.params.id },
      data: { isReconciled: true, reconciledAt: new Date(), notes, reconciledByAdminId: req.user.adminId, reconciledByEmployeeId: req.user.employeeId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "BANK RECONCILIATION MARKED", table: "BankReconciliation", targetId: recon.id });
    res.json({ message: "Marked as reconciled", data: recon });
  } catch (err) {
    res.status(500).json({ error: "Failed to reconcile", message: err.message });
  }
};

exports.listBankRecons = async (req, res) => {
  try {
    const { isReconciled, fromDate, toDate } = req.query;
    const where = {};
    if (isReconciled !== undefined) where.isReconciled = isReconciled === "true";
    if (fromDate || toDate) where.statementDate = {};
    if (fromDate) where.statementDate.gte = new Date(fromDate);
    if (toDate) where.statementDate.lte = new Date(toDate);
    const recons = await prisma.bankReconciliation.findMany({ where, orderBy: { statementDate: "desc" }, take: 200 });
    res.json({ data: recons });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bank reconciliations" });
  }
};

// ─── Suspense Account ─────────────────────────────────────────────────────────

exports.createSuspense = async (req, res) => {
  try {
    const { amount, source, receivedAt, referenceNo, senderInfo, notes, metadata } = req.body;
    const entry = await prisma.suspenseAccount.create({
      data: { amount, source, receivedAt: new Date(receivedAt), referenceNo, senderInfo, notes, metadata },
    });
    res.status(201).json({ message: "Suspense entry created", data: entry });
  } catch (err) {
    res.status(500).json({ error: "Failed to create suspense entry", message: err.message });
  }
};

exports.resolveSuspense = async (req, res) => {
  try {
    const { resolvedLoanId, notes } = req.body;
    const entry = await prisma.suspenseAccount.update({
      where: { id: req.params.id },
      data: { status: "RESOLVED", resolvedLoanId, resolvedAt: new Date(), notes, resolvedByAdminId: req.user.adminId, resolvedByEmployeeId: req.user.employeeId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "SUSPENSE RESOLVED", table: "SuspenseAccount", targetId: entry.id, metadata: { resolvedLoanId } });
    res.json({ message: "Suspense resolved", data: entry });
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve suspense", message: err.message });
  }
};

exports.listSuspense = async (req, res) => {
  try {
    const { status } = req.query;
    const entries = await prisma.suspenseAccount.findMany({
      where: status ? { status } : {},
      orderBy: { receivedAt: "desc" },
    });
    res.json({ data: entries });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch suspense entries" });
  }
};

// ─── Reversal Requests ────────────────────────────────────────────────────────

exports.createReversal = async (req, res) => {
  try {
    const { paymentId, reason, requestedAmount, metadata } = req.body;
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    const reversal = await prisma.reversalRequest.create({
      data: { paymentId, reason, requestedAmount, metadata, requestedByAdminId: req.user.adminId, requestedByEmployeeId: req.user.employeeId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "REVERSAL REQUEST CREATED", table: "ReversalRequest", targetId: reversal.id, metadata: { paymentId } });
    res.status(201).json({ message: "Reversal request created", data: reversal });
  } catch (err) {
    res.status(500).json({ error: "Failed to create reversal request", message: err.message });
  }
};

exports.approveReversal = async (req, res) => {
  try {
    const { approvedAmount } = req.body;
    const reversal = await prisma.reversalRequest.findUnique({ where: { id: req.params.id } });
    if (!reversal) return res.status(404).json({ error: "Reversal not found" });
    if (reversal.status !== "PENDING") return res.status(400).json({ error: "Reversal is not pending" });
    const updated = await prisma.reversalRequest.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedAmount, approvedByAdminId: req.user.adminId, approvedByEmployeeId: req.user.employeeId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "REVERSAL APPROVED", table: "ReversalRequest", targetId: reversal.id });
    res.json({ message: "Reversal approved", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve reversal", message: err.message });
  }
};

exports.rejectReversal = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ error: "Rejection reason required" });
    const updated = await prisma.reversalRequest.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", rejectionReason, approvedByAdminId: req.user.adminId },
    });
    res.json({ message: "Reversal rejected", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject reversal", message: err.message });
  }
};

exports.listReversals = async (req, res) => {
  try {
    const { status } = req.query;
    const reversals = await prisma.reversalRequest.findMany({
      where: status ? { status } : {},
      include: { payment: { select: { id: true, amount: true, paymentDate: true, loanId: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: reversals });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reversals" });
  }
};
