const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

exports.createMandate = async (req, res) => {
  try {
    const {
      loanId, userId, mandateType, bankName, bankBranch,
      accountNumber, accountType, ifscCode, accountHolderName,
      maxAmount, frequency, startDate, endDate,
    } = req.body;

    const mandate = await prisma.nachMandate.create({
      data: {
        loanId, userId, mandateType, bankName, bankBranch,
        accountNumber, accountType, ifscCode, accountHolderName,
        maxAmount, frequency,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        createdByAdminId: req.user.adminId,
        createdByEmployeeId: req.user.employeeId,
      },
    });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "NACH_MANDATE_CREATED", table: "NachMandate", targetId: mandate.id, metadata: { loanId } });
    res.status(201).json({ message: "Mandate created", data: mandate });
  } catch (err) {
    res.status(500).json({ error: "Failed to create mandate", message: err.message });
  }
};

exports.listMandates = async (req, res) => {
  try {
    const { loanId, userId, status } = req.query;
    const where = {};
    if (loanId) where.loanId = loanId;
    if (userId) where.userId = userId;
    if (status) where.status = status;
    const mandates = await prisma.nachMandate.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: mandates });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch mandates" });
  }
};

exports.getMandate = async (req, res) => {
  try {
    const mandate = await prisma.nachMandate.findUnique({
      where: { id: req.params.id },
      include: { bounceEvents: { orderBy: { bounceDate: "desc" }, take: 10 } },
    });
    if (!mandate) return res.status(404).json({ error: "Mandate not found" });
    res.json({ data: mandate });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch mandate" });
  }
};

exports.updateMandate = async (req, res) => {
  try {
    const { status, umrn, registeredAt, rejectionReason, nextPresentationDate, metadata } = req.body;
    const mandate = await prisma.nachMandate.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(umrn && { umrn }),
        ...(registeredAt && { registeredAt: new Date(registeredAt) }),
        ...(rejectionReason && { rejectionReason }),
        ...(nextPresentationDate && { nextPresentationDate: new Date(nextPresentationDate) }),
        ...(metadata && { metadata }),
      },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "NACH_MANDATE_UPDATED", table: "NachMandate", targetId: mandate.id });
    res.json({ message: "Mandate updated", data: mandate });
  } catch (err) {
    res.status(500).json({ error: "Failed to update mandate", message: err.message });
  }
};

exports.cancelMandate = async (req, res) => {
  try {
    const { cancelReason } = req.body;
    const mandate = await prisma.nachMandate.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED", cancelReason, cancelledAt: new Date(), cancelledBy: req.user.adminId || req.user.employeeId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "NACH_MANDATE_CANCELLED", table: "NachMandate", targetId: mandate.id });
    res.json({ message: "Mandate cancelled", data: mandate });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel mandate", message: err.message });
  }
};

// ─── NACH Presentation File Export ───────────────────────────────────────────
// Generates a CSV listing all ACTIVE mandates ready for bank submission.
// Format follows NPCI NACH file structure (simplified — adapt to actual bank format).

exports.exportPresentationFile = async (req, res) => {
  try {
    const { presentationDate } = req.query;
    const date = presentationDate ? new Date(presentationDate) : new Date();

    const mandates = await prisma.nachMandate.findMany({
      where: { status: "ACTIVE" },
      include: { loan: { select: { fileNo: true } }, user: { select: { firstName: true, lastName: true } } },
    });

    if (!mandates.length) return res.status(404).json({ error: "No active mandates found" });

    const rows = [
      // Header row
      ["UMRN", "Account Holder Name", "Bank Name", "IFSC", "Account Number", "Account Type", "Amount", "Frequency", "Start Date", "End Date", "Loan File No"].join(","),
      ...mandates.map(m => [
        m.umrn || "",
        `"${m.accountHolderName}"`,
        `"${m.bankName}"`,
        m.ifscCode,
        m.accountNumber,
        m.accountType,
        Number(m.maxAmount),
        m.frequency,
        m.startDate ? new Date(m.startDate).toISOString().slice(0, 10) : "",
        m.endDate ? new Date(m.endDate).toISOString().slice(0, 10) : "",
        m.loan?.fileNo || "",
      ].join(",")),
    ];

    const csv = rows.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=nach_presentation_${date.toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "Failed to export NACH file", message: err.message });
  }
};
