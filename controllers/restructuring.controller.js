const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");
const { generateEMISchedule } = require("./loan.controller");

// ─── Restructuring Requests ───────────────────────────────────────────────────

exports.createRequest = async (req, res) => {
  try {
    const {
      loanId, type, reason, boardApprovalRequired,
      interestWaived, fineWaived, principalWaived,
      newTenureMonths, newInterestRate, newStartDate, newEmiAmount, moratoriumMonths,
      settlementAmount, settlementDate, metadata,
    } = req.body;

    const loan = await prisma.loan.findUnique({ where: { id: loanId }, include: { emi: true } });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const request = await prisma.restructuringRequest.create({
      data: {
        loanId,
        type,
        reason,
        boardApprovalRequired: boardApprovalRequired ?? false,
        interestWaived: interestWaived ?? 0,
        fineWaived: fineWaived ?? 0,
        principalWaived: principalWaived ?? 0,
        newTenureMonths,
        newInterestRate,
        newStartDate: newStartDate ? new Date(newStartDate) : null,
        newEmiAmount,
        moratoriumMonths,
        settlementAmount,
        settlementDate: settlementDate ? new Date(settlementDate) : null,
        oldScheduleSnapshot: loan.emi,
        metadata,
        requestedByAdminId: req.user.adminId,
        requestedByEmployeeId: req.user.employeeId,
      },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `RESTRUCTURING REQUEST CREATED: ${type}`, table: "RestructuringRequest", targetId: request.id, metadata: { loanId } });
    res.status(201).json({ message: "Restructuring request created", data: request });
  } catch (err) {
    res.status(500).json({ error: "Failed to create restructuring request", message: err.message });
  }
};

exports.listRequests = async (req, res) => {
  try {
    const { loanId, status, type } = req.query;
    const where = {};
    if (loanId) where.loanId = loanId;
    if (status) where.status = status;
    if (type) where.type = type;
    const requests = await prisma.restructuringRequest.findMany({
      where,
      include: { loan: { select: { fileNo: true, principalLoanAmount: true, pendingAmount: true } }, waiverRequests: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: requests });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch restructuring requests" });
  }
};

exports.getRequest = async (req, res) => {
  try {
    const request = await prisma.restructuringRequest.findUnique({
      where: { id: req.params.id },
      include: { loan: true, waiverRequests: true },
    });
    if (!request) return res.status(404).json({ error: "Request not found" });
    res.json({ data: request });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch restructuring request" });
  }
};

exports.approveRequest = async (req, res) => {
  try {
    const { approvalComment } = req.body;
    const request = await prisma.restructuringRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "PENDING_APPROVAL") return res.status(400).json({ error: "Request is not pending approval" });

    const updated = await prisma.restructuringRequest.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvalComment, approvedByAdminId: req.user.adminId, approvedByEmployeeId: req.user.employeeId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "RESTRUCTURING APPROVED", table: "RestructuringRequest", targetId: request.id });
    res.json({ message: "Restructuring request approved", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve restructuring request", message: err.message });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ error: "Rejection reason is required" });
    const request = await prisma.restructuringRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (!["PENDING_APPROVAL", "DRAFT"].includes(request.status)) return res.status(400).json({ error: "Cannot reject in current status" });

    const updated = await prisma.restructuringRequest.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", rejectionReason, approvedByAdminId: req.user.adminId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "RESTRUCTURING REJECTED", table: "RestructuringRequest", targetId: request.id });
    res.json({ message: "Restructuring request rejected", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject restructuring request", message: err.message });
  }
};

exports.submitForApproval = async (req, res) => {
  try {
    const request = await prisma.restructuringRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "DRAFT") return res.status(400).json({ error: "Only DRAFT requests can be submitted" });
    const updated = await prisma.restructuringRequest.update({ where: { id: req.params.id }, data: { status: "PENDING_APPROVAL" } });
    res.json({ message: "Submitted for approval", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit restructuring request", message: err.message });
  }
};

// ─── Apply Restructuring ─────────────────────────────────────────────────────

exports.applyRequest = async (req, res) => {
  try {
    const request = await prisma.restructuringRequest.findUnique({
      where: { id: req.params.id },
      include: { loan: { include: { emi: true } } },
    });
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "APPROVED") return res.status(400).json({ error: "Only APPROVED requests can be applied" });

    const loan = request.loan;

    await prisma.$transaction(async (tx) => {
      // ── WRITE_OFF ──────────────────────────────────────────────────────────
      if (request.type === "WRITE_OFF") {
        await tx.eMISchedule.updateMany({
          where: { loanId: loan.id, isPaid: false },
          data: { status: "CANCELLED" },
        });
        await tx.loan.update({
          where: { id: loan.id },
          data: { fileStatus: "WRITTEN_OFF", pendingAmount: 0, isClosed: true },
        });
        await tx.restructuringRequest.update({
          where: { id: request.id },
          data: { status: "APPLIED", appliedAt: new Date() },
        });
        return;
      }

      // ── SETTLEMENT ────────────────────────────────────────────────────────
      if (request.type === "SETTLEMENT") {
        const settlementAmt = Number(request.settlementAmount) || 0;
        await tx.eMISchedule.updateMany({
          where: { loanId: loan.id, isPaid: false },
          data: { status: "CANCELLED" },
        });
        // Record settlement as a payment entry for reconciliation
        if (settlementAmt > 0) {
          await tx.payment.create({
            data: {
              loanId: loan.id,
              amount: settlementAmt,
              paymentMode: "SETTLEMENT",
              paymentDate: request.settlementDate || new Date(),
              isForeclosure: true,
              verified: true,
              metadata: { source: "RESTRUCTURING_SETTLEMENT", restructuringId: request.id },
            },
          });
        }
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            fileStatus: "FORECLOSED",
            isClosed: true,
            isForeclosed: true,
            foreclosedAt: request.settlementDate || new Date(),
            pendingAmount: 0,
            totalPaidAmount: { increment: settlementAmt },
          },
        });
        await tx.restructuringRequest.update({
          where: { id: request.id },
          data: { status: "APPLIED", appliedAt: new Date() },
        });
        return;
      }

      // ── RESCHEDULE / MORATORIUM / TOP_UP ──────────────────────────────────
      const newTenure = request.newTenureMonths || loan.tenureMonths;
      const newRate = request.newInterestRate ?? loan.interestRate;
      const newStart = request.newStartDate || loan.startDate;
      const moratoriumMonths = request.moratoriumMonths || 0;

      // Determine remaining principal (unpaid)
      const unpaidEmis = loan.emi.filter((e) => !e.isPaid);
      const remainingPrincipal = unpaidEmis.reduce((s, e) => s + Number(e.principalAmount || 0), 0) || loan.pendingAmount;

      const schedule = generateEMISchedule({
        principalLoanAmount: remainingPrincipal,
        interestRate: newRate,
        tenureMonths: newTenure,
        startDate: newStart,
        paymentFrequency: loan.paymentFrequency || "MONTHLY",
        interestComputation: loan.interestType || "FLAT",
        loanStructure: moratoriumMonths > 0 ? "EMI" : "EMI",
        moratoriumMonths,
        moratoriumType: "INTEREST_ONLY",
      });

      // Delete unpaid EMIs
      await tx.eMISchedule.deleteMany({
        where: { loanId: loan.id, isPaid: false },
      });

      // Insert new schedule
      const totalInterest = schedule.reduce((s, e) => s + (e.interestAmount || 0), 0);
      const totalAmount = schedule.reduce((s, e) => s + (e.totalAmount || e.emiAmount || 0), 0);
      const monthlyEmi = schedule.find((e) => !e.isMoratorium)?.emiAmount || 0;

      for (const row of schedule) {
        await tx.eMISchedule.create({
          data: {
            loanId: loan.id,
            emiNumber: row.emiNumber,
            dueDate: new Date(row.dueDate),
            emiAmount: row.emiAmount || 0,
            principalAmount: row.principalAmount || 0,
            interestAmount: row.interestAmount || 0,
            fineAmount: 0,
            isPaid: false,
            status: row.isMoratorium ? "MORATORIUM" : "PENDING",
          },
        });
      }

      const newEndDate = schedule.length > 0
        ? new Date(schedule[schedule.length - 1].dueDate)
        : loan.endDate;

      await tx.loan.update({
        where: { id: loan.id },
        data: {
          tenureMonths: newTenure,
          interestRate: newRate,
          startDate: newStart,
          endDate: newEndDate,
          interestAmount: totalInterest,
          totalAmount: loan.totalPaidAmount + totalAmount,
          pendingAmount: totalAmount,
          monthlyPayableAmount: monthlyEmi,
        },
      });

      await tx.restructuringRequest.update({
        where: { id: request.id },
        data: {
          status: "APPLIED",
          appliedAt: new Date(),
          newScheduleSnapshot: schedule,
        },
      });
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.activity,
      action: `RESTRUCTURING APPLIED: ${request.type}`,
      table: "RestructuringRequest",
      targetId: request.id,
      metadata: { loanId: loan.id },
    });

    res.json({ message: "Restructuring applied successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to apply restructuring", message: err.message });
  }
};

// ─── Waiver Requests ──────────────────────────────────────────────────────────

exports.createWaiver = async (req, res) => {
  try {
    const { loanId, restructuringId, waiverType, requestedAmount, reason } = req.body;
    const waiver = await prisma.waiverRequest.create({
      data: { loanId, restructuringId, waiverType, requestedAmount, reason, requestedByAdminId: req.user.adminId, requestedByEmployeeId: req.user.employeeId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `WAIVER REQUEST: ${waiverType}`, table: "WaiverRequest", targetId: waiver.id, metadata: { loanId, requestedAmount } });
    res.status(201).json({ message: "Waiver request created", data: waiver });
  } catch (err) {
    res.status(500).json({ error: "Failed to create waiver request", message: err.message });
  }
};

exports.listWaivers = async (req, res) => {
  try {
    const { loanId, status } = req.query;
    const where = {};
    if (loanId) where.loanId = loanId;
    if (status) where.status = status;
    const waivers = await prisma.waiverRequest.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: waivers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch waivers" });
  }
};

exports.approveWaiver = async (req, res) => {
  try {
    const { approvedAmount, approvalComment } = req.body;
    const waiver = await prisma.waiverRequest.findUnique({ where: { id: req.params.id } });
    if (!waiver) return res.status(404).json({ error: "Waiver not found" });
    if (waiver.status !== "PENDING") return res.status(400).json({ error: "Waiver is not pending" });
    if (approvedAmount > waiver.requestedAmount) return res.status(400).json({ error: "Approved amount cannot exceed requested amount" });

    const updated = await prisma.waiverRequest.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedAmount, approvalComment, approvedByAdminId: req.user.adminId, approvedByEmployeeId: req.user.employeeId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "WAIVER APPROVED", table: "WaiverRequest", targetId: waiver.id });
    res.json({ message: "Waiver approved", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve waiver", message: err.message });
  }
};

exports.rejectWaiver = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ error: "Rejection reason is required" });
    const updated = await prisma.waiverRequest.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", rejectionReason, approvedByAdminId: req.user.adminId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "WAIVER REJECTED", table: "WaiverRequest", targetId: req.params.id });
    res.json({ message: "Waiver rejected", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject waiver", message: err.message });
  }
};
