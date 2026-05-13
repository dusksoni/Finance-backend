const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Channel Partners ─────────────────────────────────────────────────────────

exports.createPartner = async (req, res) => {
  try {
    const { name, partnerType, contactPerson, phone, email, address, panNumber, gstNumber, agreementStart, agreementEnd, eligibleBranchIds, eligibleLoanTypeIds, notes, metadata } = req.body;
    const partner = await prisma.channelPartner.create({
      data: { name, partnerType, contactPerson, phone, email, address, panNumber, gstNumber, agreementStart: agreementStart ? new Date(agreementStart) : null, agreementEnd: agreementEnd ? new Date(agreementEnd) : null, eligibleBranchIds: eligibleBranchIds ?? [], eligibleLoanTypeIds: eligibleLoanTypeIds ?? [], notes, metadata, createdByAdminId: req.user.adminId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "CHANNEL PARTNER CREATED", table: "ChannelPartner", targetId: partner.id });
    res.status(201).json({ message: "Channel partner created", data: partner });
  } catch (err) {
    res.status(500).json({ error: "Failed to create channel partner", message: err.message });
  }
};

exports.listPartners = async (req, res) => {
  try {
    const { partnerType, status } = req.query;
    const where = {};
    if (partnerType) where.partnerType = partnerType;
    if (status) where.status = status;
    const partners = await prisma.channelPartner.findMany({ where, orderBy: { name: "asc" } });
    res.json({ data: partners });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch partners" });
  }
};

exports.getPartner = async (req, res) => {
  try {
    const partner = await prisma.channelPartner.findUnique({
      where: { id: req.params.id },
      include: { commissionRules: true, delinquencyMetrics: { orderBy: { asOfDate: "desc" }, take: 1 } },
    });
    if (!partner) return res.status(404).json({ error: "Partner not found" });
    res.json({ data: partner });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch partner" });
  }
};

exports.updatePartner = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.agreementStart) data.agreementStart = new Date(data.agreementStart);
    if (data.agreementEnd) data.agreementEnd = new Date(data.agreementEnd);
    const partner = await prisma.channelPartner.update({ where: { id: req.params.id }, data });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "CHANNEL PARTNER UPDATED", table: "ChannelPartner", targetId: partner.id });
    res.json({ message: "Partner updated", data: partner });
  } catch (err) {
    res.status(500).json({ error: "Failed to update partner", message: err.message });
  }
};

// ─── Commission Rules ─────────────────────────────────────────────────────────

exports.addCommissionRule = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { loanTypeId, commissionType, commissionValue, trigger, clawbackEnabled, clawbackThresholdMonths, clawbackPercent } = req.body;
    const rule = await prisma.partnerCommissionRule.create({
      data: { partnerId, loanTypeId, commissionType: commissionType ?? "PERCENTAGE", commissionValue, trigger: trigger ?? "DISBURSEMENT", clawbackEnabled: clawbackEnabled ?? false, clawbackThresholdMonths: clawbackThresholdMonths ?? 3, clawbackPercent: clawbackPercent ?? 100 },
    });
    res.status(201).json({ message: "Commission rule added", data: rule });
  } catch (err) {
    res.status(500).json({ error: "Failed to add commission rule", message: err.message });
  }
};

exports.updateCommissionRule = async (req, res) => {
  try {
    const rule = await prisma.partnerCommissionRule.update({ where: { id: req.params.ruleId }, data: req.body });
    res.json({ message: "Rule updated", data: rule });
  } catch (err) {
    res.status(500).json({ error: "Failed to update commission rule", message: err.message });
  }
};

exports.deleteCommissionRule = async (req, res) => {
  try {
    await prisma.partnerCommissionRule.update({ where: { id: req.params.ruleId }, data: { isActive: false } });
    res.json({ message: "Rule deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to deactivate rule" });
  }
};

// ─── Partner Leads ────────────────────────────────────────────────────────────

exports.createLead = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { userId, loanId, source, referenceNo, notes, metadata } = req.body;
    const lead = await prisma.partnerLead.create({ data: { partnerId, userId, loanId, source, referenceNo, notes, metadata } });
    res.status(201).json({ message: "Lead created", data: lead });
  } catch (err) {
    res.status(500).json({ error: "Failed to create lead", message: err.message });
  }
};

exports.updateLeadStatus = async (req, res) => {
  try {
    const { status, rejectionReason, notes } = req.body;
    const data = { status, notes };
    if (status === "CONVERTED") data.convertedAt = new Date();
    if (rejectionReason) data.rejectionReason = rejectionReason;
    const lead = await prisma.partnerLead.update({ where: { id: req.params.leadId }, data });
    res.json({ message: "Lead status updated", data: lead });
  } catch (err) {
    res.status(500).json({ error: "Failed to update lead", message: err.message });
  }
};

exports.listLeads = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { status } = req.query;
    const leads = await prisma.partnerLead.findMany({
      where: { partnerId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: leads });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leads" });
  }
};

// ─── Partner Payouts ──────────────────────────────────────────────────────────

exports.createPayout = async (req, res) => {
  try {
    const { partnerId, loanId, ruleId, triggerEvent, commissionAmount, gstAmount, netAmount, notes } = req.body;
    const payout = await prisma.partnerPayout.create({
      data: { partnerId, loanId, ruleId, triggerEvent, commissionAmount, gstAmount: gstAmount ?? 0, netAmount, notes },
    });
    res.status(201).json({ message: "Payout created", data: payout });
  } catch (err) {
    res.status(500).json({ error: "Failed to create payout", message: err.message });
  }
};

exports.processPayout = async (req, res) => {
  try {
    const { transactionRef, notes } = req.body;
    const payout = await prisma.partnerPayout.update({
      where: { id: req.params.payoutId },
      data: { status: "PAID", paidAt: new Date(), transactionRef, notes, processedByAdminId: req.user.adminId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "PARTNER PAYOUT PROCESSED", table: "PartnerPayout", targetId: payout.id, metadata: { partnerId: payout.partnerId } });
    res.json({ message: "Payout processed", data: payout });
  } catch (err) {
    res.status(500).json({ error: "Failed to process payout", message: err.message });
  }
};

exports.clawbackPayout = async (req, res) => {
  try {
    const { clawbackReason } = req.body;
    if (!clawbackReason) return res.status(400).json({ error: "Clawback reason required" });
    const payout = await prisma.partnerPayout.update({
      where: { id: req.params.payoutId },
      data: { status: "CLAWBACK", clawbackReason, processedByAdminId: req.user.adminId },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "PARTNER PAYOUT CLAWBACK", table: "PartnerPayout", targetId: payout.id });
    res.json({ message: "Clawback initiated", data: payout });
  } catch (err) {
    res.status(500).json({ error: "Failed to initiate clawback", message: err.message });
  }
};

exports.listPayouts = async (req, res) => {
  try {
    const { partnerId, status } = req.query;
    const where = {};
    if (partnerId) where.partnerId = partnerId;
    if (status) where.status = status;
    const payouts = await prisma.partnerPayout.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: payouts });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch payouts" });
  }
};

// ─── Delinquency Metrics ──────────────────────────────────────────────────────

exports.recordMetric = async (req, res) => {
  try {
    const { partnerId, asOfDate, totalLoans, activeLoans, overdueLoans, npaLoans, totalDisbursed, totalOverdueAmt, par30, par90 } = req.body;
    const metric = await prisma.channelDelinquencyMetric.upsert({
      where: { partnerId_asOfDate: { partnerId, asOfDate: new Date(asOfDate) } },
      update: { totalLoans, activeLoans, overdueLoans, npaLoans, totalDisbursed, totalOverdueAmt, par30, par90 },
      create: { partnerId, asOfDate: new Date(asOfDate), totalLoans: totalLoans ?? 0, activeLoans: activeLoans ?? 0, overdueLoans: overdueLoans ?? 0, npaLoans: npaLoans ?? 0, totalDisbursed: totalDisbursed ?? 0, totalOverdueAmt: totalOverdueAmt ?? 0, par30: par30 ?? 0, par90: par90 ?? 0 },
    });
    res.json({ message: "Metric recorded", data: metric });
  } catch (err) {
    res.status(500).json({ error: "Failed to record metric", message: err.message });
  }
};

exports.getPartnerMetrics = async (req, res) => {
  try {
    const metrics = await prisma.channelDelinquencyMetric.findMany({
      where: { partnerId: req.params.partnerId },
      orderBy: { asOfDate: "desc" },
      take: 12,
    });
    res.json({ data: metrics });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
};

// ─── Auto-Calculate Payouts for a Period ─────────────────────────────────────

exports.autoCalculatePayouts = async (req, res) => {
  try {
    const { partnerId, periodStart, periodEnd } = req.body;
    if (!partnerId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: "partnerId, periodStart, periodEnd are required" });
    }

    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const partner = await prisma.channelPartner.findUnique({ where: { id: partnerId } });
    if (!partner) return res.status(404).json({ error: "Partner not found" });

    const rules = await prisma.partnerCommissionRule.findMany({
      where: { partnerId, isActive: true },
    });
    if (!rules.length) return res.status(400).json({ error: "No active commission rules for this partner" });

    // Find all loans disbursed by this partner in the period
    const leads = await prisma.partnerLead.findMany({
      where: { partnerId, status: "CONVERTED", convertedAt: { gte: start, lte: end } },
      include: { loan: { select: { id: true, principalLoanAmount: true, loanTypeId: true } } },
    });

    let totalCommission = 0;
    const payoutItems = [];

    for (const lead of leads) {
      if (!lead.loan) continue;
      const loanAmount = Number(lead.loan.principalLoanAmount || 0);

      // Find best matching rule
      const rule = rules.find(r =>
        (!r.loanTypeId || r.loanTypeId === lead.loan.loanTypeId) &&
        (!r.minLoanAmount || loanAmount >= Number(r.minLoanAmount)) &&
        (!r.maxLoanAmount || loanAmount <= Number(r.maxLoanAmount))
      );
      if (!rule) continue;

      let commission = 0;
      if (rule.commissionType === "PERCENTAGE") {
        commission = loanAmount * (Number(rule.commissionValue) / 100);
      } else {
        commission = Number(rule.commissionValue);
      }

      // Check if payout already exists for this loan
      const existing = await prisma.partnerPayout.findFirst({ where: { loanId: lead.loanId, partnerId } });
      if (existing) continue;

      totalCommission += commission;
      payoutItems.push({ loanId: lead.loanId, commission });
    }

    // Bulk create payouts
    const created = [];
    for (const item of payoutItems) {
      const payout = await prisma.partnerPayout.create({
        data: {
          partnerId,
          loanId: item.loanId,
          amount: item.commission,
          periodStart: start,
          periodEnd: end,
          status: "PENDING",
          processedByAdminId: req.user.adminId,
        },
      });
      created.push(payout.id);
    }

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "PARTNER_PAYOUTS_AUTO_CALCULATED", table: "PartnerPayout", metadata: { partnerId, totalCommission, count: created.length } });
    res.status(201).json({ message: "Payouts calculated", data: { totalCommission, payoutsCreated: created.length, payoutIds: created } });
  } catch (err) {
    res.status(500).json({ error: "Failed to auto-calculate payouts", message: err.message });
  }
};
