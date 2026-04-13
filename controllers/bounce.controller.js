const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

exports.recordBounce = async (req, res) => {
  try {
    const {
      loanId, emiId, mandateId, eventType, bounceDate,
      returnReason, bounceCharge, gstOnCharge, retryDate,
      instrumentNo, bankRef, notes,
    } = req.body;

    const total = Number(bounceCharge || 0) + Number(gstOnCharge || 0);

    const event = await prisma.bounceEvent.create({
      data: {
        loanId, emiId, mandateId, eventType,
        bounceDate: new Date(bounceDate),
        returnReason,
        bounceCharge: bounceCharge || 0,
        gstOnCharge: gstOnCharge || 0,
        totalCharge: total,
        retryDate: retryDate ? new Date(retryDate) : null,
        instrumentNo, bankRef, notes,
        recordedByAdminId: req.user.adminId,
        recordedByEmployeeId: req.user.employeeId,
      },
    });

    // Increment retry count on mandate if provided
    if (mandateId) {
      await prisma.nachMandate.update({
        where: { id: mandateId },
        data: { retryCount: { increment: 1 }, status: "BOUNCED", nextPresentationDate: retryDate ? new Date(retryDate) : null },
      });
    }

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `BOUNCE_RECORDED: ${eventType}`, table: "BounceEvent", targetId: event.id, metadata: { loanId } });
    res.status(201).json({ message: "Bounce event recorded", data: event });
  } catch (err) {
    res.status(500).json({ error: "Failed to record bounce event", message: err.message });
  }
};

exports.listBounces = async (req, res) => {
  try {
    const { loanId, mandateId, eventType, chargeCollected } = req.query;
    const where = {};
    if (loanId) where.loanId = loanId;
    if (mandateId) where.mandateId = mandateId;
    if (eventType) where.eventType = eventType;
    if (chargeCollected !== undefined) where.chargeCollected = chargeCollected === "true";

    const events = await prisma.bounceEvent.findMany({ where, orderBy: { bounceDate: "desc" } });
    res.json({ data: events });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bounce events" });
  }
};

exports.markChargeCollected = async (req, res) => {
  try {
    const event = await prisma.bounceEvent.update({
      where: { id: req.params.id },
      data: { chargeCollected: true, chargeCollectedAt: new Date() },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "BOUNCE_CHARGE_COLLECTED", table: "BounceEvent", targetId: event.id });
    res.json({ message: "Charge marked as collected", data: event });
  } catch (err) {
    res.status(500).json({ error: "Failed to update bounce event", message: err.message });
  }
};
