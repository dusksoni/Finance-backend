/**
 * Unified Payment Gateway Controller
 * Routes through the active gateway selected in payment.settings.activeGateway
 */

const { generateQR, checkStatus, getActiveGateway } = require("../utils/paymentGateway");

/**
 * POST /api/payment/generate-qr
 * Body: { loanId, emiId?, amount, paymentType, emiAmount?, fineAmount?, fineDiscount? }
 */
exports.generateQR = async (req, res) => {
  try {
    const { loanId, emiId, amount, paymentType, emiAmount, fineAmount, fineDiscount } = req.body;

    if (!loanId) return res.status(400).json({ error: "loanId is required", status: 400 });
    if (!amount || amount <= 0) return res.status(400).json({ error: "Valid amount is required", status: 400 });

    const data = await generateQR({
      loanId,
      emiId,
      amount,
      paymentType,
      emiAmount,
      fineAmount,
      fineDiscount,
      user: req.user,
    });

    return res.status(200).json({ status: 200, data });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ error: err.message || "Failed to generate QR", status: code });
  }
};

/**
 * GET /api/payment/status/:merchantTranId
 */
exports.checkStatus = async (req, res) => {
  try {
    const { merchantTranId } = req.params;
    const data = await checkStatus(merchantTranId);
    return res.status(200).json({ status: 200, data });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ error: err.message || "Failed to check payment status", status: code });
  }
};

/**
 * GET /api/payment/active-gateway
 * Returns which gateway is currently active (used by frontend to show correct UI)
 */
exports.getActiveGateway = async (req, res) => {
  try {
    const gateway = await getActiveGateway();
    return res.status(200).json({ status: 200, data: { activeGateway: gateway } });
  } catch (err) {
    return res.status(500).json({ error: err.message, status: 500 });
  }
};
