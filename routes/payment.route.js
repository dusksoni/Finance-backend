/**
 * Unified Payment Gateway Routes
 * All payment flows use these endpoints — the active gateway is selected from AppConfig.
 */

const express = require("express");
const router = express.Router();
const paymentGatewayController = require("../controllers/paymentGateway.controller");
const { authMiddleware } = require("../middleware/auth");

// POST /api/payment/generate-qr
router.post("/generate-qr", authMiddleware, paymentGatewayController.generateQR);

// GET /api/payment/status/:merchantTranId
router.get("/status/:merchantTranId", authMiddleware, paymentGatewayController.checkStatus);

// GET /api/payment/active-gateway
router.get("/active-gateway", authMiddleware, paymentGatewayController.getActiveGateway);

// POST /api/payment/orange/callback  — PhiCommerce posts here after payment
router.post("/orange/callback", async (req, res) => {
  try {
    const { handleCallback } = require("../controllers/gateways/orangeGateway");
    await handleCallback(req.body);
    res.status(200).json({ status: "received" });
  } catch (err) {
    console.error("Orange PG callback error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
